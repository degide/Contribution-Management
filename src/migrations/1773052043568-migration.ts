import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1773052043568 implements MigrationInterface {
  name = 'Migration1773052043568';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "user_email" character varying, "user_role" character varying, "action" text NOT NULL, "target_type" character varying, "target_id" uuid, "before_state" jsonb, "after_state" jsonb, "ip_address" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_audit_created_at" ON "audit_logs" ("created_at") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_target" ON "audit_logs" ("target_type", "target_id") `,
    );
    await queryRunner.query(`CREATE INDEX "IDX_audit_action" ON "audit_logs" ("action") `);
    await queryRunner.query(`CREATE INDEX "IDX_audit_user_id" ON "audit_logs" ("user_id") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_action"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_target"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_created_at"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
