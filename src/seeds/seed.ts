/**
 * Seed script. Populates the database with realistic demo data.
 * Run with: npm run seed
 *
 * Creates:
 *   - 1 admin user
 *   - 2 employers (Kigali Tea Co, Rwanda Construction Ltd)
 *   - 2 employer user accounts
 *   - 5 employees per employer (10 total)
 *   - 3 months of declarations per employer (various statuses)
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { join } from 'path';

dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? '',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? '',
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  synchronize: false,
});

async function seed() {
  await AppDataSource.initialize();
  const q = AppDataSource.createQueryRunner();

  console.log('Starting seed...\n');

  try {
    await q.startTransaction();

    // CLEAR existing seed data (idempotent)
    await q.query(`DELETE FROM contribution_lines`);
    await q.query(`DELETE FROM declarations`);
    await q.query(`DELETE FROM employees`);
    await q.query(`DELETE FROM users`);
    await q.query(`DELETE FROM employers`);

    // Seed employers
    const [kigaliTea] = await q.query(`
      INSERT INTO employers (name, tin, sector, phone, address)
      VALUES ('Kigali Tea Company Ltd', '100123456', 'private', '+250788100001', 'KG 12 Ave, Kigali')
      RETURNING id
    `);
    const [rwandaConstruction] = await q.query(`
      INSERT INTO employers (name, tin, sector, phone, address)
      VALUES ('Rwanda Construction Ltd', '200987654', 'private', '+250788200001', 'KN 5 Rd, Kigali')
      RETURNING id
    `);

    const emp1Id = kigaliTea.id;
    const emp2Id = rwandaConstruction.id;
    console.log(`Employers created: ${emp1Id}, ${emp2Id}`);

    // Seed users (admin + 2 employers)
    const adminHash = await bcrypt.hash('Admin1234!', 12);
    const employer1Hash = await bcrypt.hash('Employer1234!', 12);
    const employer2Hash = await bcrypt.hash('Employer2nd!', 12);

    await q.query(
      `
      INSERT INTO users (email, password, role, employer_id, is_active)
      VALUES
        ('admin@rssb.rw',            $1, 'admin',    NULL,    true),
        ('employer@kigalitea.rw',    $2, 'employer', $4,      true),
        ('employer@rwconstruct.rw',  $3, 'employer', $5,      true)
    `,
      [adminHash, employer1Hash, employer2Hash, emp1Id, emp2Id],
    );

    console.log('Users created');
    console.log('   admin@rssb.rw          / Admin1234!');
    console.log('   employer@kigalitea.rw  / Employer1234!');
    console.log('   employer@rwconstruct.rw / Employer2nd!');

    // Seed employees for Kigali Tea
    const teaEmployees = [
      {
        nationalId: '1199080123456001',
        firstName: 'Jean',
        lastName: 'Habimana',
        dob: '1990-03-12',
        hire: '2018-01-15',
        salary: 450000,
      },
      {
        nationalId: '1198570234567002',
        firstName: 'Marie',
        lastName: 'Uwimana',
        dob: '1985-07-22',
        hire: '2019-06-01',
        salary: 620000,
      },
      {
        nationalId: '1199200345678003',
        firstName: 'Pierre',
        lastName: 'Nkurunziza',
        dob: '1992-11-05',
        hire: '2020-03-01',
        salary: 380000,
      },
      {
        nationalId: '1198880456789004',
        firstName: 'Claudine',
        lastName: 'Mukamana',
        dob: '1988-01-30',
        hire: '2017-09-01',
        salary: 550000,
      },
      {
        nationalId: '1199540567890005',
        firstName: 'Emmanuel',
        lastName: 'Bizimana',
        dob: '1995-04-18',
        hire: '2021-07-15',
        salary: 420000,
      },
    ];

    const teaEmpIds: string[] = [];
    for (const e of teaEmployees) {
      const [row] = await q.query(
        `
        INSERT INTO employees (national_id, first_name, last_name, date_of_birth, hire_date, gross_salary, employer_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
        [e.nationalId, e.firstName, e.lastName, e.dob, e.hire, e.salary, emp1Id],
      );
      teaEmpIds.push(row.id);
    }
    console.log('Kigali Tea employees created');

    // Seed employees for Rwanda Construction
    const constructEmployees = [
      {
        nationalId: '1199160678901006',
        firstName: 'Alexis',
        lastName: 'Ntirenganya',
        dob: '1991-06-14',
        hire: '2016-04-01',
        salary: 700000,
      },
      {
        nationalId: '1198640789012007',
        firstName: 'Solange',
        lastName: 'Ingabire',
        dob: '1986-09-25',
        hire: '2018-11-01',
        salary: 850000,
      },
      {
        nationalId: '1199310890123008',
        firstName: 'Patrick',
        lastName: 'Rutayisire',
        dob: '1993-02-08',
        hire: '2020-01-15',
        salary: 480000,
      },
      {
        nationalId: '1198920901234009',
        firstName: 'Jacqueline',
        lastName: 'Nyiranziza',
        dob: '1989-12-20',
        hire: '2019-03-01',
        salary: 560000,
      },
      {
        nationalId: '1199740012345010',
        firstName: 'Olivier',
        lastName: 'Habiyaremye',
        dob: '1997-08-03',
        hire: '2022-05-01',
        salary: 400000,
      },
    ];

    const constructEmpIds: string[] = [];
    for (const e of constructEmployees) {
      const [row] = await q.query(
        `
        INSERT INTO employees (national_id, first_name, last_name, date_of_birth, hire_date, gross_salary, employer_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `,
        [e.nationalId, e.firstName, e.lastName, e.dob, e.hire, e.salary, emp2Id],
      );
      constructEmpIds.push(row.id);
    }
    console.log('Rwanda Construction employees created');

    // HELPER: create a declaration with lines
    async function createDeclaration(
      employerId: string,
      period: string,
      status: string,
      employeeIds: string[],
      salaries: number[],
    ) {
      const now = new Date();
      const shortId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const paymentNumber = `PAY-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${shortId}`;

      const [decl] = await q.query(
        `
        INSERT INTO declarations (payment_number, employer_id, period, status, submitted_at, validated_at, total_pension, total_medical, total_maternity, grand_total)
        VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0)
        RETURNING id
      `,
        [
          paymentNumber,
          employerId,
          period,
          status,
          ['submitted', 'validated', 'rejected'].includes(status) ? new Date() : null,
          status === 'validated' ? new Date() : null,
        ],
      );

      let totalPension = 0,
        totalMedical = 0,
        totalMaternity = 0,
        grandTotal = 0;

      for (let i = 0; i < employeeIds.length; i++) {
        const salary = salaries[i];
        const pension = Math.round(salary * 0.06 * 100) / 100;
        const medical = Math.round(salary * 0.075 * 100) / 100;
        const maternity = Math.round(salary * 0.003 * 100) / 100;
        const total = Math.round((pension + medical + maternity) * 100) / 100;

        totalPension += pension;
        totalMedical += medical;
        totalMaternity += maternity;
        grandTotal += total;

        await q.query(
          `
          INSERT INTO contribution_lines (declaration_id, employee_id, gross_salary, pension_amount, medical_amount, maternity_amount, total)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [decl.id, employeeIds[i], salary, pension, medical, maternity, total],
        );
      }

      await q.query(
        `
        UPDATE declarations
        SET total_pension = $1, total_medical = $2, total_maternity = $3, grand_total = $4
        WHERE id = $5
      `,
        [
          Math.round(totalPension * 100) / 100,
          Math.round(totalMedical * 100) / 100,
          Math.round(totalMaternity * 100) / 100,
          Math.round(grandTotal * 100) / 100,
          decl.id,
        ],
      );

      return decl.id;
    }

    // Seed declarations for Kigali Tea
    const teaSalaries = [450000, 620000, 380000, 550000, 420000];
    await createDeclaration(emp1Id, '2024-10', 'validated', teaEmpIds, teaSalaries);
    await createDeclaration(emp1Id, '2024-11', 'validated', teaEmpIds, teaSalaries);
    await createDeclaration(emp1Id, '2024-12', 'submitted', teaEmpIds, teaSalaries);
    await createDeclaration(emp1Id, '2025-01', 'draft', teaEmpIds, teaSalaries);
    console.log('Kigali Tea declarations created (2x validated, 1 submitted, 1 draft)');

    // Seed declarations for Rwanda Construction
    const constructSalaries = [700000, 850000, 480000, 560000, 400000];
    await createDeclaration(emp2Id, '2024-11', 'validated', constructEmpIds, constructSalaries);
    await createDeclaration(emp2Id, '2024-12', 'rejected', constructEmpIds, constructSalaries);
    await createDeclaration(emp2Id, '2025-01', 'draft', constructEmpIds, constructSalaries);
    console.log('Rwanda Construction declarations created (1 validated, 1 rejected, 1 draft)');

    await q.commitTransaction();

    console.log('\nSeed complete!\n');
    console.log('   Login credentials:');
    console.log('   Role: admin    │ admin@rssb.rw           │ Admin1234!');
    console.log('   Role: employer │ employer@kigalitea.rw   │ Employer1234!');
    console.log('   Role: employer │ employer@rwconstruct.rw │ Employer2nd!\n');
  } catch (err) {
    await q.rollbackTransaction();
    console.error('Seed failed:', err);
    throw err;
  } finally {
    await q.release();
    await AppDataSource.destroy();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
