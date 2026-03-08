import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1772991921394 implements MigrationInterface {
  name = 'Migration1772991921394';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "isActive" TO "is_active"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" RENAME COLUMN "is_active" TO "isActive"`);
  }
}
