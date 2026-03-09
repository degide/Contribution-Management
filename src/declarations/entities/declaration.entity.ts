import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Employer } from '../../employers/entities/employer.entity';
import { ContributionLine } from './contribution-line.entity';

export enum DeclarationStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  VALIDATED = 'validated',
  REJECTED = 'rejected',
}

@Entity('declarations')
// Enforce one declaration per employer per period at DB level
@Index('UQ_declaration_employer_period', ['employerId', 'period'], {
  unique: true,
})
export class Declaration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Auto-generated unique payment reference number
  @Index({ unique: true })
  @Column({ name: 'payment_number', unique: true })
  paymentNumber: string;

  @Column({ name: 'employer_id' })
  employerId: string;

  @ManyToOne(() => Employer, (employer) => employer.declarations, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'employer_id' })
  employer: Employer;

  // Period in YYYY-MM format, e.g. "2024-01"
  @Column({ length: 7 })
  period: string;

  @Column({
    type: 'enum',
    enum: DeclarationStatus,
    default: DeclarationStatus.DRAFT,
  })
  status: DeclarationStatus;

  @Column({ name: 'submitted_at', nullable: true, type: 'timestamptz' })
  submittedAt: Date;

  @Column({ name: 'validated_at', nullable: true, type: 'timestamptz' })
  validatedAt: Date;

  // Admin note for rejection reason
  @Column({ nullable: true, name: 'rejection_reason' })
  rejectionReason: string;

  // Cached totals for quick reads — recalculated on submission
  @Column({
    name: 'total_pension',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  totalPension: number;

  @Column({
    name: 'total_medical',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  totalMedical: number;

  @Column({
    name: 'total_maternity',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  totalMaternity: number;

  @Column({
    name: 'grand_total',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  grandTotal: number;

  @OneToMany(() => ContributionLine, (line) => line.declaration, {
    cascade: true,
  })
  contributionLines: ContributionLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @BeforeInsert()
  generatePaymentNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const shortId = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
    this.paymentNumber = `PAY-${year}${month}-${shortId}`;
  }
}
