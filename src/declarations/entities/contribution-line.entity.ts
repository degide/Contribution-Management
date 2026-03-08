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
  PENSION: 0.06, // 6%
  MEDICAL: 0.075, // 7.5%
  MATERNITY: 0.003, // 0.3%
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
  @Column({ name: 'gross_salary', type: 'decimal', precision: 15, scale: 2 })
  grossSalary: number;

  @Column({ name: 'pension_amount', type: 'decimal', precision: 15, scale: 2 })
  pensionAmount: number;

  @Column({ name: 'medical_amount', type: 'decimal', precision: 15, scale: 2 })
  medicalAmount: number;

  @Column({ name: 'maternity_amount', type: 'decimal', precision: 15, scale: 2 })
  maternityAmount: number;

  @Column({ name: 'total', type: 'decimal', precision: 15, scale: 2 })
  total: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Helper: calculate contributions from gross salary
  static calculate(grossSalary: number): {
    pensionAmount: number;
    medicalAmount: number;
    maternityAmount: number;
    total: number;
  } {
    const pension = Math.round(grossSalary * CONTRIBUTION_RATES.PENSION * 100) / 100;
    const medical = Math.round(grossSalary * CONTRIBUTION_RATES.MEDICAL * 100) / 100;
    const maternity = Math.round(grossSalary * CONTRIBUTION_RATES.MATERNITY * 100) / 100;
    return {
      pensionAmount: pension,
      medicalAmount: medical,
      maternityAmount: maternity,
      total: Math.round((pension + medical + maternity) * 100) / 100,
    };
  }
}
