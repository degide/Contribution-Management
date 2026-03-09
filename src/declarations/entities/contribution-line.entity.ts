import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Declaration } from './declaration.entity';
import { Employee } from '../../employees/entities/employee.entity';

// Contribution rates
export const CONTRIBUTION_RATES = {
  PENSION: 0.06, // 6% of gross salary (No opt-out for pension)
  MEDICAL: 0.075, // 7.5% of gross salary
  MATERNITY: 0.003, // 0.3% of gross salary
};

@Entity('contribution_lines')
@Index('UQ_contribution_line_declaration_employee', ['declarationId', 'employeeId'], {
  unique: true,
})
export class ContributionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'declaration_id' })
  declarationId: string;

  @ManyToOne(() => Declaration, (declaration) => declaration.contributionLines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'declaration_id' })
  declaration: Declaration;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Employee, (employee) => employee.contributionLines, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  // Gross salary for this specific period (may differ from base salary)
  @Column({
    name: 'gross_salary',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  grossSalary: number;

  @Column({
    name: 'pension_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  pensionAmount: number;

  @Column({
    name: 'medical_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  medicalAmount: number;

  @Column({
    name: 'maternity_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  maternityAmount: number;

  @Column({
    name: 'total',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  total: number;

  @Column({ name: 'include_medical', default: true })
  includeMedical: boolean;

  @Column({ name: 'include_maternity', default: true })
  includeMaternity: boolean;

  // Notes or comments about this contribution line (e.g. reason for overrides or opt-outs)
  @Column({ name: 'note', nullable: true, type: 'text' })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Calculate contribution amounts from gross salary and enrollment flags.
   *
   * @param grossSalary     Salary for the period
   * @param includeMedical  Whether the default provided medical contribution applies
   * @param includeMaternity  Whether the maternity contribution applies
   */
  static calculate(
    grossSalary: number,
    includeMedical = true,
    includeMaternity = true,
  ): {
    pensionAmount: number;
    medicalAmount: number;
    maternityAmount: number;
    total: number;
  } {
    const round = (n: number) => Math.round(n * 100) / 100;

    const pension = round(grossSalary * CONTRIBUTION_RATES.PENSION);
    const medical = includeMedical ? round(grossSalary * CONTRIBUTION_RATES.MEDICAL) : 0;
    const maternity = includeMaternity ? round(grossSalary * CONTRIBUTION_RATES.MATERNITY) : 0;

    return {
      pensionAmount: pension,
      medicalAmount: medical,
      maternityAmount: maternity,
      total: round(pension + medical + maternity),
    };
  }
}
