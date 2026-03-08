import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

dotenv.config();

// Per-run unique values
// Suffix all mutable test data with a timestamp so each test run is isolated
// from leftover rows in the database (no teardown dependency).

const RUN_ID = Date.now().toString().slice(-6); // 6 digits
const TEST_NATIONAL_ID = `19999${RUN_ID}7099`.padEnd(16, '0').slice(0, 16); // 16 digits
const TEST_PERIOD = `2${RUN_ID.slice(0, 3)}-${((parseInt(RUN_ID.slice(3, 5)) % 12) + 1).toString().padStart(2, '0')}`; // format YYYY-MM

/**
 * E2E tests for critical flows:
 *  1. Auth: login
 *  2. Employers: scoped access, role enforcement, duplicate TIN
 *  3. Employees: registration, duplicate national ID
 *  4. Declaration lifecycle: create draft -> submit -> validate
 *  5. Duplicate period prevention
 *  6. Role-based access on contribution summary
 */

describe('Contribution Management API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let adminToken: string;
  let employerToken: string;
  let employerId: string;

  // IDs of resources created during this run. Used for cleanup
  let createdEmployeeId: string;
  let createdDeclarationId: string;

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
    // Cleanup rows created during this run
    // Order matters: contribution_lines -> declarations -> employees (FK constraints)
    if (createdDeclarationId) {
      await dataSource.query(`DELETE FROM contribution_lines WHERE declaration_id = $1`, [
        createdDeclarationId,
      ]);
      await dataSource.query(`DELETE FROM declarations WHERE id = $1`, [createdDeclarationId]);
    }
    if (createdEmployeeId) {
      await dataSource.query(`DELETE FROM employees WHERE id = $1`, [createdEmployeeId]);
    }

    await app.close();
  });

  // Authentication tests
  describe('Authentication', () => {
    it('admin login succeeds and returns a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@rssb.rw', password: 'Admin1234!' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('admin');
      adminToken = res.body.accessToken;
    });

    it('wrong password returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'admin@rssb.rw', password: 'wrongpassword' })
        .expect(401);
    });

    it('employer login succeeds and returns employerId', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'employer@kigalitea.rw', password: 'Employer1234!' })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('employer');
      employerToken = res.body.accessToken;
      employerId = res.body.user.employerId;
    });

    it('missing token returns 401', async () => {
      await request(app.getHttpServer()).get('/api/employers').expect(401);
    });
  });

  // Employer tests
  describe('Employers', () => {
    it('employer sees only their own record', async () => {
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

    it('employer role cannot create a new employer (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/employers')
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ name: 'Test Co', tin: '999999998', sector: 'private' })
        .expect(403);
    });

    it('duplicate TIN returns 409', async () => {
      await request(app.getHttpServer())
        .post('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Duplicate TIN Co', tin: '100123456', sector: 'private' })
        .expect(409);
    });

    it('employer cannot access another employer record (403)', async () => {
      // Fetch any employer that is NOT the logged-in employer
      const listRes = await request(app.getHttpServer())
        .get('/api/employers')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const otherId = listRes.body.data.find((e: any) => e.id !== employerId)?.id;
      if (!otherId) return; // skip if only one employer exists

      await request(app.getHttpServer())
        .get(`/api/employers/${otherId}`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(403);
    });
  });

  // Employee tests
  describe('Employees', () => {
    it('employer can register an employee', async () => {
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

    it('employer cannot register employee for another employer (403)', async () => {
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

  // Declaration lifecycle tests
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

    it('can update lines while still in DRAFT status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/lines`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ lines: [{ employeeId: createdEmployeeId, grossSalary: 600000 }] })
        .expect(200);

      // Recalculated: 600000 × 6% = 36000
      const line = res.body.contributionLines[0];
      expect(parseFloat(line.pensionAmount)).toBeCloseTo(36000, 2);
    });

    it('submitting moves status to submitted and sets submittedAt', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/submit`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);

      expect(res.body.status).toBe('submitted');
      expect(res.body.submittedAt).toBeDefined();
    });

    it('cannot edit lines once submitted', async () => {
      await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/lines`)
        .set('Authorization', `Bearer ${employerToken}`)
        .send({ lines: [{ employeeId: createdEmployeeId, grossSalary: 700000 }] })
        .expect(400);
    });

    it('employer cannot validate a declaration (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/validate`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(403);
    });

    it('admin can validate a submitted declaration', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.status).toBe('validated');
      expect(res.body.validatedAt).toBeDefined();
    });

    it('cannot validate a declaration that is not in submitted status', async () => {
      // Already validated — should reject
      await request(app.getHttpServer())
        .patch(`/api/declarations/${createdDeclarationId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });

  // Contribution summary tests
  describe('Contribution Summary', () => {
    it('returns a monthly breakdown for own employer', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/employers/${employerId}/contribution-summary`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);

      expect(res.body.monthlyBreakdown).toBeDefined();
      expect(Array.isArray(res.body.monthlyBreakdown)).toBe(true);
      expect(res.body.aggregateTotals).toBeDefined();
      expect(res.body.employer.id).toBe(employerId);
    });

    it('date range filter is reflected in the response', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/employers/${employerId}/contribution-summary?from=2024-10&to=2024-12`)
        .set('Authorization', `Bearer ${employerToken}`)
        .expect(200);

      expect(res.body.filter.from).toBe('2024-10');
      expect(res.body.filter.to).toBe('2024-12');
      // Months outside the range must not appear
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
        .get(`/api/employers/00000000-0000-0000-0000-000000000000/contribution-summary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
