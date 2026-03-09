import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1773015129808 implements MigrationInterface {
  name = 'Migration1773015129808';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "UQ_e05c58bbdf174466081e1cfbeae"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "UQ_e05c58bbdf174466081e1cfbeae" UNIQUE ("national_id")`,
    );
  }
}
