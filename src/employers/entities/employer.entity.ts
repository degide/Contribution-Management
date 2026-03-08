import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { Declaration } from '../../declarations/entities/declaration.entity';

export enum EmployerStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

export enum EmployerSector {
  PUBLIC = 'public',
  PRIVATE = 'private',
  NGO = 'ngo',
  PARASTATAL = 'parastatal',
}

@Entity('employers')
export class Employer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  // Tax Identification Number — must be unique across all employers
  @Index({ unique: true })
  @Column({ unique: true })
  tin: string;

  @Column({ type: 'enum', enum: EmployerSector })
  sector: EmployerSector;

  @Column({
    name: 'registration_date',
    type: 'date',
    default: () => 'CURRENT_DATE',
  })
  registrationDate: Date;

  @Column({
    type: 'enum',
    enum: EmployerStatus,
    default: EmployerStatus.ACTIVE,
  })
  status: EmployerStatus;

  // Contact info
  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  address: string;

  @Column({ name: 'deleted_at', nullable: true, type: 'timestamptz' })
  deletedAt: Date;

  @OneToMany(() => Employee, (employee) => employee.employer)
  employees: Employee[];

  @OneToMany(() => Declaration, (declaration) => declaration.employer)
  declarations: Declaration[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
