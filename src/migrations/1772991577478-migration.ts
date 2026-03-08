import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1772991577478 implements MigrationInterface {
    name = 'Migration1772991577478'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'employer')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "password" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'employer', "employer_id" character varying, "isActive" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."declarations_status_enum" AS ENUM('draft', 'submitted', 'validated', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "declarations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "payment_number" character varying NOT NULL, "employer_id" uuid NOT NULL, "period" character varying(7) NOT NULL, "status" "public"."declarations_status_enum" NOT NULL DEFAULT 'draft', "submitted_at" TIMESTAMP WITH TIME ZONE, "validated_at" TIMESTAMP WITH TIME ZONE, "rejection_reason" character varying, "total_pension" numeric(15,2) NOT NULL DEFAULT '0', "total_medical" numeric(15,2) NOT NULL DEFAULT '0', "total_maternity" numeric(15,2) NOT NULL DEFAULT '0', "grand_total" numeric(15,2) NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_751f72a8640e97cdcd85f208057" UNIQUE ("payment_number"), CONSTRAINT "PK_5130900b6f081acc9852743532e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_751f72a8640e97cdcd85f20805" ON "declarations" ("payment_number") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_declaration_employer_period" ON "declarations" ("employer_id", "period") `);
        await queryRunner.query(`CREATE TABLE "contribution_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "declaration_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "gross_salary" numeric(15,2) NOT NULL, "pension_amount" numeric(15,2) NOT NULL, "medical_amount" numeric(15,2) NOT NULL, "maternity_amount" numeric(15,2) NOT NULL, "total" numeric(15,2) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2152e6ee06d6a6631f1899ed398" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_contribution_line_declaration_employee" ON "contribution_lines" ("declaration_id", "employee_id") `);
        await queryRunner.query(`CREATE TABLE "employees" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "national_id" character varying NOT NULL, "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "date_of_birth" date NOT NULL, "hire_date" date NOT NULL, "gross_salary" numeric(15,2) NOT NULL, "email" character varying, "phone" character varying, "is_active" boolean NOT NULL DEFAULT true, "employer_id" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e05c58bbdf174466081e1cfbeae" UNIQUE ("national_id"), CONSTRAINT "PK_b9535a98350d5b26e7eb0c26af4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_e05c58bbdf174466081e1cfbea" ON "employees" ("national_id") `);
        await queryRunner.query(`CREATE TYPE "public"."employers_sector_enum" AS ENUM('public', 'private', 'ngo', 'parastatal')`);
        await queryRunner.query(`CREATE TYPE "public"."employers_status_enum" AS ENUM('active', 'suspended')`);
        await queryRunner.query(`CREATE TABLE "employers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "tin" character varying NOT NULL, "sector" "public"."employers_sector_enum" NOT NULL, "registration_date" date NOT NULL DEFAULT ('now'::text)::date, "status" "public"."employers_status_enum" NOT NULL DEFAULT 'active', "phone" character varying, "address" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_ddca441565747fd3c0a4e614d3f" UNIQUE ("tin"), CONSTRAINT "PK_f2c1aea3e8d7aa3c5fba949c97d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_ddca441565747fd3c0a4e614d3" ON "employers" ("tin") `);
        await queryRunner.query(`ALTER TABLE "declarations" ADD CONSTRAINT "FK_d72727a4e01a87278a7090f0370" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contribution_lines" ADD CONSTRAINT "FK_0cd22b30dbdabbd8ed652012b1e" FOREIGN KEY ("declaration_id") REFERENCES "declarations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contribution_lines" ADD CONSTRAINT "FK_157cf68d3f90a29dc4a7f499e49" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "employees" ADD CONSTRAINT "FK_ebeb3f3873766df45f15e9614bb" FOREIGN KEY ("employer_id") REFERENCES "employers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "employees" DROP CONSTRAINT "FK_ebeb3f3873766df45f15e9614bb"`);
        await queryRunner.query(`ALTER TABLE "contribution_lines" DROP CONSTRAINT "FK_157cf68d3f90a29dc4a7f499e49"`);
        await queryRunner.query(`ALTER TABLE "contribution_lines" DROP CONSTRAINT "FK_0cd22b30dbdabbd8ed652012b1e"`);
        await queryRunner.query(`ALTER TABLE "declarations" DROP CONSTRAINT "FK_d72727a4e01a87278a7090f0370"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ddca441565747fd3c0a4e614d3"`);
        await queryRunner.query(`DROP TABLE "employers"`);
        await queryRunner.query(`DROP TYPE "public"."employers_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."employers_sector_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e05c58bbdf174466081e1cfbea"`);
        await queryRunner.query(`DROP TABLE "employees"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_contribution_line_declaration_employee"`);
        await queryRunner.query(`DROP TABLE "contribution_lines"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_declaration_employer_period"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_751f72a8640e97cdcd85f20805"`);
        await queryRunner.query(`DROP TABLE "declarations"`);
        await queryRunner.query(`DROP TYPE "public"."declarations_status_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    }

}
