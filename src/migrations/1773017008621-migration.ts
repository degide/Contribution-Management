import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1773017008621 implements MigrationInterface {
  name = 'Migration1773017008621';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contribution_lines" ADD "include_medical" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "contribution_lines" ADD "include_maternity" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`ALTER TABLE "contribution_lines" ADD "note" text`);
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "enrolled_medical" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD "enrolled_maternity" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "enrolled_maternity"`);
    await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "enrolled_medical"`);
    await queryRunner.query(`ALTER TABLE "contribution_lines" DROP COLUMN "note"`);
    await queryRunner.query(`ALTER TABLE "contribution_lines" DROP COLUMN "include_maternity"`);
    await queryRunner.query(`ALTER TABLE "contribution_lines" DROP COLUMN "include_medical"`);
  }
}
