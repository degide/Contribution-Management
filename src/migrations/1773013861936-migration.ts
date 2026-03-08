import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1773013861936 implements MigrationInterface {
    name = 'Migration1773013861936'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "is_active"`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'suspended', 'deleted')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "status" "public"."users_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`CREATE TYPE "public"."employees_status_enum" AS ENUM('active', 'suspended', 'deleted')`);
        await queryRunner.query(`ALTER TABLE "employees" ADD "status" "public"."employees_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`ALTER TABLE "employees" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "employers" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TYPE "public"."employers_status_enum" RENAME TO "employers_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."employers_status_enum" AS ENUM('active', 'suspended', 'deleted')`);
        await queryRunner.query(`ALTER TABLE "employers" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employers" ALTER COLUMN "status" TYPE "public"."employers_status_enum" USING "status"::"text"::"public"."employers_status_enum"`);
        await queryRunner.query(`ALTER TABLE "employers" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."employers_status_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."employers_status_enum_old" AS ENUM('active', 'suspended')`);
        await queryRunner.query(`ALTER TABLE "employers" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "employers" ALTER COLUMN "status" TYPE "public"."employers_status_enum_old" USING "status"::"text"::"public"."employers_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "employers" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."employers_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."employers_status_enum_old" RENAME TO "employers_status_enum"`);
        await queryRunner.query(`ALTER TABLE "employers" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "employees" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."employees_status_enum"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`ALTER TABLE "employees" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "users" ADD "is_active" boolean NOT NULL DEFAULT true`);
    }

}
