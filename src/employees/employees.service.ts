import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Employee, EmployeeStatus } from './entities/employee.entity';
import { Employer, EmployerStatus } from '../employers/entities/employer.entity';
import { CreateEmployeeDto, UpdateEmployeeDto, EmployeeQueryDto } from './dto/employee.dto';
import { paginate, PaginatedResponse } from '../common/dto/pagination.dto';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Employer)
    private readonly employerRepo: Repository<Employer>,
  ) {}

  async create(dto: CreateEmployeeDto, currentUser: User): Promise<Employee> {
    // Validate employer exists and is active
    const employer = await this.employerRepo.findOne({ where: { id: dto.employerId } });
    if (!employer || employer.status === EmployerStatus.DELETED) {
      throw new NotFoundException(`Employer ${dto.employerId} not found`);
    }
    if (employer.status === EmployerStatus.SUSPENDED) {
      throw new BadRequestException('Cannot add employees to a suspended employer');
    }

    // Employer users can only add employees to their own company
    if (currentUser.role === UserRole.EMPLOYER && currentUser.employerId !== dto.employerId) {
      throw new ForbiddenException('You can only register employees for your own company');
    }

    const existing = await this.employeeRepo.findOne({
      where: { nationalId: dto.nationalId, employerId: dto.employerId },
    });
    if (existing) {
      throw new ConflictException(
        `Employee with National ID ${dto.nationalId} already exists for this employer`,
      );
    }

    const employee = this.employeeRepo.create({ ...dto, status: EmployeeStatus.ACTIVE });
    return this.employeeRepo.save(employee);
  }

  async findAll(query: EmployeeQueryDto, currentUser: User): Promise<PaginatedResponse<Employee>> {
    const { limit = 10, offset = 0, search, employerId } = query;

    const qb = this.employeeRepo
      .createQueryBuilder('employee')
      .leftJoinAndSelect('employee.employer', 'employer')
      // Never surface soft-deleted employees in list responses
      .where('employee.status != :deleted', { deleted: EmployeeStatus.DELETED })
      .orderBy('employee.createdAt', 'DESC');

    // Employer users can only see their own employees
    if (currentUser.role === UserRole.EMPLOYER) {
      qb.andWhere('employee.employerId = :employerId', { employerId: currentUser.employerId });
    } else if (employerId) {
      qb.andWhere('employee.employerId = :employerId', { employerId });
    }

    if (search) {
      qb.andWhere(
        '(employee.firstName ILIKE :search OR employee.lastName ILIKE :search OR employee.nationalId ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.take(Number(limit)).skip(Number(offset));

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, Number(limit), Number(offset));
  }

  async findOne(id: string, currentUser: User): Promise<Employee> {
    const employee = await this.employeeRepo.findOne({
      where: { id, status: Not(EmployeeStatus.DELETED) },
      relations: ['employer'],
    });

    if (!employee) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    // Employer users can only see employees from their company
    if (currentUser.role === UserRole.EMPLOYER && employee.employerId !== currentUser.employerId) {
      throw new ForbiddenException('You can only access employees from your own company');
    }

    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto, currentUser: User): Promise<Employee> {
    const employee = await this.findOne(id, currentUser);

    if (dto.nationalId && dto.nationalId !== employee.nationalId) {
      const conflict = await this.employeeRepo.findOne({
        where: { nationalId: dto.nationalId, employerId: employee.employerId },
      });
      if (conflict) {
        throw new ConflictException(
          `Employee with National ID ${dto.nationalId} is already in use for this employer`,
        );
      }
    }

    Object.assign(employee, dto);
    return this.employeeRepo.save(employee);
  }

  /**
   * Soft-deletes an employee by setting its status to DELETED and recording the deletion timestamp.
   *
   *  @param id - The ID of the employee to delete
   *  @param currentUser - The user performing the deletion, used for access control
   *  @throws NotFoundException if the employee does not exist or is already deleted
   */
  async remove(id: string, currentUser: User): Promise<void> {
    const employee = await this.findOne(id, currentUser);
    employee.status = EmployeeStatus.DELETED;
    employee.deletedAt = new Date();
    await this.employeeRepo.save(employee);
  }

  async findByEmployer(employerId: string): Promise<Employee[]> {
    return this.employeeRepo.find({
      where: { employerId, status: EmployeeStatus.ACTIVE },
      order: { lastName: 'ASC' },
    });
  }
}
