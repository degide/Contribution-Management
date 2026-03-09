/**
 * E2E tests for critical flows:
 *  1. Auth: login
 *  2. Employers: scoped access, role enforcement, duplicate TIN
 *  3. Employees: registration, duplicate national ID
 *  4. Declaration lifecycle: create draft -> submit -> validate
 *  5. Duplicate period prevention
 *  6. Role-based access on contribution summary
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

dotenv.config();

// Per-run unique values
// All mutable test data is suffixed with a timestamp so consecutive runs never
// collide on unique constraints (TIN, email, national ID, period).
const RUN_ID = Date.now().toString().slice(-7);

const TEST_NATIONAL_ID = `1999${RUN_ID}7099`.slice(0, 16).padEnd(16, '0');
const TEST_PERIOD = `2${RUN_ID.slice(0, 3)}-${((parseInt(RUN_ID.slice(3, 5)) % 12) + 1)
  .toString()
  .padStart(2, '0')}`;

// Employer created during the test suite (to test full onboarding + cleanup)
const TEST_EMPLOYER_TIN = ('3' + RUN_ID + '0').slice(0, 9);
const TEST_EMPLOYER_EMAIL = `employer.${RUN_ID}@testco.rw`;
const TEST_EMPLOYER_PASSWORD = 'TestPass1234!';

describe('Contribution Management API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let employerToken: string; // seed employer from seed.ts
  let employerId: string; // seed employer ID

  // Resources created during this run, tracked for cleanup
  let createdEmployeeId: string;
  let createdDeclarationId: string;
  let createdEmployerId: string; // employer created by onboarding test
  let createdEmployerUserId: string; // user account created alongside it

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    // Delete in FK-safe order: lines -> declarations -> employees -> users -> employers
    if (createdDeclarationId) {
      await dataSource.query(`DELETE FROM contribution_lines WHERE declaration_id = $1`, [
        createdDeclarationId,
      ]);
      await dataSource.query(`DELETE FROM declarations WHERE id = $1`, [createdDeclarationId]);
    }
    if (createdEmployeeId) {
      await dataSource.query(`DELETE FROM employees WHERE id = $1`, [createdEmployeeId]);
    }
    if (createdEmployerUserId) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [createdEmployerUserId]);
    }
    if (createdEmployerId) {
      await dataSource.query(`DELETE FROM employers WHERE id = $1`, [createdEmployerId]);
    }

    await app.close();
  });

  // Auth tests are first to get valid tokens for subsequent tests,
  // and also to verify that the seed admin and employer accounts are working as expected.
  describe('Auth — login', () => {
    it('admin login succeeds and returns a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@rssb.rw', password: 'Admin1234!' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.employerId).toBeNull();
      adminToken = res.body.accessToken;
    });

    it('wrong password returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@rssb.rw', password: 'wrongpassword' })
        .expect(401);
    });

    it('unknown email returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@rssb.rw', password: 'whatever' })
        .expect(401);
    });

    it('seed employer login succeeds and includes employerId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'employer@kigalitea.rw', password: 'Employer1234!' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('employer');
      expect(res.body.user.employerId).toBeDefined();
      employerToken = res.body.accessToken;
      employerId = res.body.user.employerId;
    });

    it('unauthenticated request to protected endpoint returns 401', async () => {
      await request(app.getHttpServer()).get('/api/employers').expect(401);
    });
  });

  // The register-admin endpoint is critical for bootstrapping new admin accounts.
  // So we test it before employer onboarding.
  describe('Auth — register-admin', () => {
    it('unauthenticated call returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register-admin')
        .send({ email: 'newadmin@rssb.rw', password: 'Admin1234!' })
        .expect(401);
    });

    it('employer token returns 403', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register-admin')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ email: 'newadmin@rssb.rw', password: 'Admin1234!' })
        .expect(403);
    });

    it('admin can create another admin account', async () => {
      const email = `admin.${RUN_ID}@rssb.rw`;
      const res = await request(app.getHttpServer())
        .post('/api/auth/register-admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email, password: 'Admin1234!' })
        .expect(201);

      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.employerId).toBeNull();
      expect(res.body.accessToken).toBeDefined();

      // Clean up immediately. Not needed for subsequent tests
      await dataSource.query(`DELETE FROM users WHERE email = $1`, [email]);
    });

    it('duplicate email returns 409', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register-admin')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'admin@rssb.rw', password: 'Admin1234!' })
        .expect(409);
    });
  });

  // Employer onboarding
  describe('Employer onboarding. POST /employers', () => {
    it('unauthenticated call returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/employers')
        .send({
          name: 'Test Co',
          tin: TEST_EMPLOYER_TIN,
          sector: 'private',
          accountEmail: TEST_EMPLOYER_EMAIL,
          accountPassword: TEST_EMPLOYER_PASSWORD,
        })
        .expect(401);
    });

    it('employer role cannot onboard a new employer (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/employers')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          name: 'Test Co',
          tin: TEST_EMPLOYER_TIN,
          sector: 'private',
          accountEmail: TEST_EMPLOYER_EMAIL,
          accountPassword: TEST_EMPLOYER_PASSWORD,
        })
        .expect(403);
    });

    it('missing accountEmail / accountPassword returns 400 (validation)', async () => {
      await request(app.getHttpServer())
        .post('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'No Creds Co', tin: '111222333', sector: 'private' })
        .expect(400);
    });

    it('admin creates employer and credentials atomically', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Company Ltd',
          tin: TEST_EMPLOYER_TIN,
          sector: 'private',
          phone: '+250788000001',
          accountEmail: TEST_EMPLOYER_EMAIL,
          accountPassword: TEST_EMPLOYER_PASSWORD,
        })
        .expect(201);

      expect(res.body.employer.id).toBeDefined();
      expect(res.body.employer.tin).toBe(TEST_EMPLOYER_TIN);
      expect(res.body.employer.status).toBe('active');
      expect(res.body.account.email).toBe(TEST_EMPLOYER_EMAIL);
      // temporaryPassword echoed once so admin can share it out-of-band
      expect(res.body.account.temporaryPassword).toBe(TEST_EMPLOYER_PASSWORD);

      createdEmployerId = res.body.employer.id;
      createdEmployerUserId = res.body.account.id;
    });

    it('new employer can immediately log in with the returned credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: TEST_EMPLOYER_EMAIL, password: TEST_EMPLOYER_PASSWORD })
        .expect(200);

      expect(res.body.user.role).toBe('employer');
      // Their JWT must be scoped to the employer record just created
      expect(res.body.user.employerId).toBe(createdEmployerId);
    });

    it('duplicate TIN returns 409', async () => {
      await request(app.getHttpServer())
        .post('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate TIN Co',
          tin: TEST_EMPLOYER_TIN,
          sector: 'private',
          accountEmail: `other.${RUN_ID}@testco.rw`,
          accountPassword: TEST_EMPLOYER_PASSWORD,
        })
        .expect(409);
    });

    it('duplicate accountEmail returns 409', async () => {
      await request(app.getHttpServer())
        .post('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Email Co',
          tin: ('4' + RUN_ID + '0').slice(0, 9),
          sector: 'private',
          accountEmail: TEST_EMPLOYER_EMAIL,
          accountPassword: TEST_EMPLOYER_PASSWORD,
        })
        .expect(409);
    });
  });

  // Employers: access control, role enforcement
  describe('Employers access control', () => {
    it('employer sees only their own record in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/employers')
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);

      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].id).toBe(employerId);
    });

    it('admin sees all employers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(2);
    });

    it('employer cannot GET another employer by ID (403)', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const otherId = listRes.body.data.find((e: any) => e.id !== employerId)?.id;
      if (!otherId) return;

      await request(app.getHttpServer())
        .get(`/api/employers/${otherId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(403);
    });
  });

  // Employees: registration, duplicate national ID, access control
  describe('Employees', () => {
    it('employer can register an employee for their own company', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          nationalId: TEST_NATIONAL_ID,
          firstName: 'Test',
          lastName: 'Employee',
          dateOfBirth: '1995-01-01',
          hireDate: '2024-01-01',
          grossSalary: 500000,
          employerId,
        })
        .expect(201);

      createdEmployeeId = res.body.id;
      expect(res.body.nationalId).toBe(TEST_NATIONAL_ID);
    });

    it('duplicate national ID returns 409', async () => {
      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          nationalId: TEST_NATIONAL_ID,
          firstName: 'Dupe',
          lastName: 'Employee',
          dateOfBirth: '1995-01-01',
          hireDate: '2024-01-01',
          grossSalary: 300000,
          employerId,
        })
        .expect(409);
    });

    it('employer cannot register an employee for a different employer (403)', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const otherId = listRes.body.data.find((e: any) => e.id !== employerId)?.id;
      if (!otherId) return;

      await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          nationalId: '9988776655443322',
          firstName: 'Intruder',
          lastName: 'User',
          dateOfBirth: '1990-01-01',
          hireDate: '2024-01-01',
          grossSalary: 400000,
          employerId: otherId,
        })
        .expect(403);
    });
  });

  // Declaration lifecycle: create draft -> submit -> validate, duplicate period prevention
  describe('Declaration lifecycle', () => {
    it('creates a draft with auto-calculated contribution amounts', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/declarations')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          employerId,
          period: TEST_PERIOD,
          lines: [{ employeeId: createdEmployeeId, grossSalary: 500000 }],
        })
        .expect(201);

      createdDeclarationId = res.body.id;
      expect(res.body.status).toBe('draft');
      expect(res.body.paymentNumber).toMatch(/^PAY-/);

      const line = res.body.contributionLines[0];
      expect(parseFloat(line.pensionAmount)).toBeCloseTo(30000, 2); // 6%
      expect(parseFloat(line.medicalAmount)).toBeCloseTo(37500, 2); // 7.5%
      expect(parseFloat(line.maternityAmount)).toBeCloseTo(1500, 2); // 0.3%
      expect(parseFloat(line.total)).toBeCloseTo(69000, 2); // 13.8%
    });

    it('duplicate period for the same employer returns 409', async () => {
      await request(app.getHttpServer())
        .post('/api/declarations')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          employerId,
          period: TEST_PERIOD,
          lines: [{ employeeId: createdEmployeeId, grossSalary: 500000 }],
        })
        .expect(409);
    });

    it('can update lines while still in DRAFT — amounts are recalculated', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/lines`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ lines: [{ employeeId: createdEmployeeId, grossSalary: 600000 }] })
        .expect(200);

      // 600000 × 6% = 36000
      expect(parseFloat(res.body.contributionLines[0].pensionAmount)).toBeCloseTo(36000, 2);
    });

    it('submitting moves status to submitted and sets submittedAt', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/submit`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);

      expect(res.body.status).toBe('submitted');
      expect(res.body.submittedAt).toBeDefined();
    });

    it('cannot edit lines once submitted (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/lines`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ lines: [{ employeeId: createdEmployeeId, grossSalary: 700000 }] })
        .expect(400);
    });

    it('cannot re-submit an already submitted declaration (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/submit`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(400);
    });

    it('employer cannot validate a declaration (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/validate`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(403);
    });

    it('admin validates the submitted declaration', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('validated');
      expect(res.body.validatedAt).toBeDefined();
    });

    it('cannot validate a declaration not in submitted status (400)', async () => {
      // Already validated — second attempt must be rejected
      await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // Contribution summary: access control, date range filtering, response structure
  describe('Contribution Summary', () => {
    it('returns a monthly breakdown for own employer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/employers/${employerId}/contribution-summary`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);

      expect(res.body.employer.id).toBe(employerId);
      expect(Array.isArray(res.body.monthlyBreakdown)).toBe(true);
      expect(res.body.aggregateTotals).toBeDefined();
      expect(res.body.aggregateTotals.grandTotal).toBeGreaterThanOrEqual(0);
    });

    it('date range filter restricts returned periods', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/employers/${employerId}/contribution-summary?from=2024-10&to=2024-12`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);

      expect(res.body.filter.from).toBe('2024-10');
      expect(res.body.filter.to).toBe('2024-12');
      res.body.monthlyBreakdown.forEach((row: any) => {
        expect(row.period >= '2024-10').toBe(true);
        expect(row.period <= '2024-12').toBe(true);
      });
    });

    it('employer cannot view another employer summary (403)', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const otherId = listRes.body.data.find((e: any) => e.id !== employerId)?.id;
      if (!otherId) return;

      await request(app.getHttpServer())
        .get(`/api/employers/${otherId}/contribution-summary`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(403);
    });

    it('non-existent employer returns 404', async () => {
      await request(app.getHttpServer())
        .get('/api/employers/00000000-0000-0000-0000-000000000000/contribution-summary')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('Contribution enrollment', () => {
    // Uses the seeded employer (employerId / employerToken from auth).
    // Creates three employees with different enrollment profiles and declares
    // a period for each, asserting exact contribution amounts.

    const EN_PERIOD = `2${RUN_ID.slice(1, 4)}-${((parseInt(RUN_ID.slice(4, 6)) % 12) + 1)
      .toString()
      .padStart(2, '0')}`;

    // National IDs unique per run
    const EN_NID_MALE = `3100${RUN_ID}0000`.slice(0, 16).padEnd(16, '0');
    const EN_NID_PRIVATE = `3200${RUN_ID}0000`.slice(0, 16).padEnd(16, '0');
    const EN_NID_FULL = `3300${RUN_ID}0000`.slice(0, 16).padEnd(16, '0');

    let maleEmployeeId: string; // enrolledMaternity=false
    let privateInsEmpId: string; // enrolledMedical=false
    let fullEnrollEmpId: string; // both true (control)
    let enrollDeclarationId: string;

    beforeAll(async () => {
      // Male employee — maternity opt-out at registration
      const male = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          nationalId: EN_NID_MALE,
          firstName: 'Mugabo',
          lastName: 'Test',
          dateOfBirth: '1992-03-10',
          hireDate: '2024-01-01',
          grossSalary: 400000,
          employerId,
          enrolledMaternity: false, // male, not eligible
          enrolledMedical: true,
        });
      maleEmployeeId = male.body.id;

      // Employee on private insurance. Medical opt-out at registration
      const priv = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          nationalId: EN_NID_PRIVATE,
          firstName: 'Uwase',
          lastName: 'Test',
          dateOfBirth: '1988-07-22',
          hireDate: '2024-01-01',
          grossSalary: 600000,
          employerId,
          enrolledMedical: false, // private insurance
          enrolledMaternity: true,
        });
      privateInsEmpId = priv.body.id;

      // Control employee, full enrollment
      const full = await request(app.getHttpServer())
        .post('/api/employees')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          nationalId: EN_NID_FULL,
          firstName: 'Ishimwe',
          lastName: 'Test',
          dateOfBirth: '1995-11-05',
          hireDate: '2024-01-01',
          grossSalary: 500000,
          employerId,
        });
      fullEnrollEmpId = full.body.id;
    });

    afterAll(async () => {
      if (enrollDeclarationId) {
        await dataSource.query(`DELETE FROM contribution_lines WHERE declaration_id = $1`, [
          enrollDeclarationId,
        ]);
        await dataSource.query(`DELETE FROM declarations WHERE id = $1`, [enrollDeclarationId]);
      }
      for (const id of [maleEmployeeId, privateInsEmpId, fullEnrollEmpId]) {
        if (id) await dataSource.query(`DELETE FROM employees WHERE id = $1`, [id]);
      }
    });

    it('enrollment defaults are persisted on the employee record', async () => {
      const male = await request(app.getHttpServer())
        .get(`/api/employees/${maleEmployeeId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);
      expect(male.body.enrolledMaternity).toBe(false);
      expect(male.body.enrolledMedical).toBe(true);

      const priv = await request(app.getHttpServer())
        .get(`/api/employees/${privateInsEmpId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);
      expect(priv.body.enrolledMedical).toBe(false);
      expect(priv.body.enrolledMaternity).toBe(true);
    });

    it('enrollment defaults can be changed via PATCH on the employee', async () => {
      // Simulate employee switching to private insurance after registration
      const res = await request(app.getHttpServer())
        .patch(`/api/employees/${fullEnrollEmpId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ enrolledMedical: false })
        .expect(200);
      expect(res.body.enrolledMedical).toBe(false);

      // Restore for the declaration test below
      await request(app.getHttpServer())
        .patch(`/api/employees/${fullEnrollEmpId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ enrolledMedical: true })
        .expect(200);
    });

    it('declaration lines reflect employee enrollment defaults correctly', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/declarations')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          employerId,
          period: EN_PERIOD,
          lines: [
            { employeeId: maleEmployeeId, grossSalary: 400000 },
            { employeeId: privateInsEmpId, grossSalary: 600000 },
            { employeeId: fullEnrollEmpId, grossSalary: 500000 },
          ],
        })
        .expect(201);

      enrollDeclarationId = res.body.id;
      const lines: any[] = res.body.contributionLines;

      const maleLine = lines.find((l: any) => l.employeeId === maleEmployeeId);
      const privLine = lines.find((l: any) => l.employeeId === privateInsEmpId);
      const fullLine = lines.find((l: any) => l.employeeId === fullEnrollEmpId);

      // Male employee: pension + medical only (no maternity)
      // 400000 × 6% = 24000, 400000 × 7.5% = 30000, maternity = 0
      expect(parseFloat(maleLine.pensionAmount)).toBeCloseTo(24000, 2);
      expect(parseFloat(maleLine.medicalAmount)).toBeCloseTo(30000, 2);
      expect(parseFloat(maleLine.maternityAmount)).toBeCloseTo(0, 2);
      expect(parseFloat(maleLine.total)).toBeCloseTo(54000, 2);
      expect(maleLine.includeMaternity).toBe(false);
      expect(maleLine.includeMedical).toBe(true);

      // Private insurance employee: pension + maternity only (no medical)
      // 600000 × 6% = 36000, medical = 0, 600000 × 0.3% = 1800
      expect(parseFloat(privLine.pensionAmount)).toBeCloseTo(36000, 2);
      expect(parseFloat(privLine.medicalAmount)).toBeCloseTo(0, 2);
      expect(parseFloat(privLine.maternityAmount)).toBeCloseTo(1800, 2);
      expect(parseFloat(privLine.total)).toBeCloseTo(37800, 2);
      expect(privLine.includeMedical).toBe(false);
      expect(privLine.includeMaternity).toBe(true);

      // Control employee: all three contributions
      // 500000 × 6% = 30000, 500000 × 7.5% = 37500, 500000 × 0.3% = 1500
      expect(parseFloat(fullLine.pensionAmount)).toBeCloseTo(30000, 2);
      expect(parseFloat(fullLine.medicalAmount)).toBeCloseTo(37500, 2);
      expect(parseFloat(fullLine.maternityAmount)).toBeCloseTo(1500, 2);
      expect(parseFloat(fullLine.total)).toBeCloseTo(69000, 2);
      expect(fullLine.includeMedical).toBe(true);
      expect(fullLine.includeMaternity).toBe(true);
    });

    it('per-line override takes priority over employee default', async () => {
      // Update the existing declaration lines. Temporarily override the male
      // employee's maternity exclusion (e.g. dispute, back-payment scenario)
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${enrollDeclarationId}/lines`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          lines: [
            {
              employeeId: maleEmployeeId,
              grossSalary: 400000,
              overrideMaternity: true, // explicit override, ignores enrolledMaternity=false
              note: 'Retroactive correction. Maternity included for this period',
            },
            { employeeId: privateInsEmpId, grossSalary: 600000 },
            { employeeId: fullEnrollEmpId, grossSalary: 500000 },
          ],
        })
        .expect(200);

      const maleLine = res.body.contributionLines.find((l: any) => l.employeeId === maleEmployeeId);

      // Now all three contributions apply for the male employee this period
      expect(parseFloat(maleLine.maternityAmount)).toBeCloseTo(1200, 2); // 400000 × 0.3%
      expect(parseFloat(maleLine.total)).toBeCloseTo(55200, 2); // 24000+30000+1200
      expect(maleLine.includeMaternity).toBe(true);
      expect(maleLine.note).toBe('Retroactive correction. Maternity included for this period');
    });

    it('per-line override can also exclude a normally-enrolled employee for a period', async () => {
      // Control employee (full enrollment) temporarily opts out of medical
      // for this period only (e.g. started private insurance mid-month)
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${enrollDeclarationId}/lines`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({
          lines: [
            { employeeId: maleEmployeeId, grossSalary: 400000 },
            { employeeId: privateInsEmpId, grossSalary: 600000 },
            {
              employeeId: fullEnrollEmpId,
              grossSalary: 500000,
              overrideMedical: false, // exclude for this period only
              note: 'Switched to SORAS from 15th. Pro-rated medical excluded',
            },
          ],
        })
        .expect(200);

      const fullLine = res.body.contributionLines.find(
        (l: any) => l.employeeId === fullEnrollEmpId,
      );

      expect(parseFloat(fullLine.medicalAmount)).toBeCloseTo(0, 2);
      expect(parseFloat(fullLine.total)).toBeCloseTo(31500, 2); // 30000 + 0 + 1500
      expect(fullLine.includeMedical).toBe(false);
      expect(fullLine.note).toContain('SORAS');

      // Employee record should still show enrolledMedical=true (default unchanged)
      const empRes = await request(app.getHttpServer())
        .get(`/api/employees/${fullEnrollEmpId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);
      expect(empRes.body.enrolledMedical).toBe(true);
    });
  });
});
