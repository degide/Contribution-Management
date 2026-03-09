import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index('IDX_audit_user_id', ['userId'])
@Index('IDX_audit_action', ['action'])
@Index('IDX_audit_target', ['targetType', 'targetId'])
@Index('IDX_audit_created_at', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string;

  @Column({ type: 'varchar', name: 'user_email', nullable: true })
  userEmail: string | null;

  @Column({ type: 'varchar', name: 'user_role', nullable: true })
  userRole: string | null;

  /**
   * Derived automatically from HTTP method and route pattern.
   */
  @Column({ type: 'text' })
  action: string;

  /** Singular capitalised resource name: Employer, Employee, Declaration */
  @Column({ type: 'varchar', name: 'target_type', nullable: true })
  targetType: string | null;

  /** Route :id param, or id extracted from the response body for creates */
  @Column({ type: 'uuid', name: 'target_id', nullable: true })
  targetId: string | null;

  /** Full DB row before the mutation — null for creates */
  @Column({ name: 'before_state', type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  /** Sanitised response body after the mutation. Null for deletes (204) */
  @Column({ name: 'after_state', type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;

  @Column({ type: 'varchar', name: 'ip_address', nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
