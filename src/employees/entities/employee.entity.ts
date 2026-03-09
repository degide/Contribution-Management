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
} from 'typeorm';
import { Employer } from '../../employers/entities/employer.entity';
import { ContributionLine } from '../../declarations/entities/contribution-line.entity';

export enum EmployeeStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

@Index('idx_employer_national_id', ['employerId', 'nationalId'], { unique: true })
@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Rwanda national ID (16 digits)
  @Column({ name: 'national_id' })
  nationalId: string;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: Date;

  @Column({ name: 'hire_date', type: 'date' })
  hireDate: Date;

  // Base gross salary which can be overridden per declaration period
  @Column({
    name: 'gross_salary',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: { to: (v) => v, from: (v) => parseFloat(v) },
  })
  grossSalary: number;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  /**
   * Indicates if the employee is enrolled in medical insurance.
   * This can be overridden per declaration period, but defaults to true when creating an employee.
   */
  @Column({ name: 'enrolled_medical', default: true })
  enrolledMedical: boolean;

  /**
   * Indicates if the employee is enrolled in maternity insurance.
   * This can be overridden per declaration period, but defaults to true when creating an employee.
   * Note: In Rwanda, maternity insurance is typically mandatory for female employees,
   * but this field allows for flexibility in case of exceptions or changes in regulations.
   */
  @Column({ name: 'enrolled_maternity', default: true })
  enrolledMaternity: boolean;

  @Column({
    type: 'enum',
    enum: EmployeeStatus,
    default: EmployeeStatus.ACTIVE,
  })
  status: EmployeeStatus;

  @Column({ name: 'deleted_at', nullable: true, type: 'timestamptz' })
  deletedAt: Date;

  @Column({ name: 'employer_id' })
  employerId: string;

  @ManyToOne(() => Employer, (employer) => employer.employees, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'employer_id' })
  employer: Employer;

  @OneToMany(() => ContributionLine, (line) => line.employee)
  contributionLines: ContributionLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
