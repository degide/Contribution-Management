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

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Rwanda national ID (16 digits). unique across the system
  @Index({ unique: true })
  @Column({ name: 'national_id', unique: true })
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
  @Column({ name: 'gross_salary', type: 'decimal', precision: 15, scale: 2 })
  grossSalary: number;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: true, name: 'is_active' })
  isActive: boolean;

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
