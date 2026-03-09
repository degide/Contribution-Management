import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, ILike, Not, Repository } from 'typeorm';
import { Employer, EmployerStatus } from './entities/employer.entity';
import {
  CreateEmployerDto,
  UpdateEmployerDto,
  EmployerQueryDto,
  CreateEmployerResponseDto,
} from './dto/employer.dto';
import { paginate, PaginatedResponse } from '../common/dto/pagination.dto';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { EmployeeStatus } from '../employees/entities/employee.entity';

@Injectable()
export class EmployersService {
  constructor(
    @InjectRepository(Employer)
    private readonly employerRepo: Repository<Employer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a new employer along with a linked user account for authentication.
   * Both records are created atomically within a transaction to ensure consistency.
   *
   * @param dto - Data transfer object containing employer and account details
   * @returns The created employer and account information, including the temporary password
   * @throws ConflictException if the TIN or email already exists
   */
  async create(dto: CreateEmployerDto): Promise<CreateEmployerResponseDto> {
    // Pre-flight uniqueness checks before opening the transaction
    const existingEmployerByTin = await this.employerRepo.findOne({ where: { tin: dto.tin } });
    if (existingEmployerByTin) {
      throw new ConflictException(`Employer with TIN ${dto.tin} already exists`);
    }

    const existingUserByEmail = await this.userRepo.findOne({ where: { email: dto.accountEmail } });
    if (existingUserByEmail) {
      throw new ConflictException(`Email ${dto.accountEmail} is already registered`);
    }

    const hashedPassword = await bcrypt.hash(dto.accountPassword, 12);

    return this.dataSource.transaction(async (manager) => {
      // 1. Create employer record
      const employer = manager.create(Employer, {
        name: dto.name,
        tin: dto.tin,
        sector: dto.sector,
        phone: dto.phone,
        address: dto.address,
        status: EmployerStatus.ACTIVE,
      });
      const savedEmployer = await manager.save(Employer, employer);

      // 2. Create linked user account
      const user = manager.create(User, {
        email: dto.accountEmail,
        password: hashedPassword,
        role: UserRole.EMPLOYER,
        employerId: savedEmployer.id,
        status: UserStatus.ACTIVE,
      });
      const savedUser = await manager.save(User, user);

      return {
        employer: {
          id: savedEmployer.id,
          name: savedEmployer.name,
          tin: savedEmployer.tin,
          sector: savedEmployer.sector,
          status: savedEmployer.status,
        },
        account: {
          id: savedUser.id,
          email: savedUser.email,
          // Returned once so the admin can hand it to the employer.
          // It is NOT to be stored anywhere in plain text after this response.
          temporaryPassword: dto.accountPassword,
        },
      };
    });
  }

  async findAll(query: EmployerQueryDto, currentUser: User): Promise<PaginatedResponse<Employer>> {
    const { limit = 10, offset = 0, status, search } = query;

    // Employer users can only see their own record
    if (currentUser.role === UserRole.EMPLOYER) {
      const employer = await this.findOne(currentUser.employerId, currentUser);
      return paginate([employer], 1, limit, offset);
    }

    const where: FindOptionsWhere<Employer> = {
      // Exclude soft-deleted records from all list responses
      status: Not(EmployerStatus.DELETED),
    };
    if (status) where.status = status;
    if (search) where.name = ILike(`%${search}%`);

    const [data, total] = await this.employerRepo.findAndCount({
      where,
      take: Number(limit),
      skip: Number(offset),
      order: { createdAt: 'DESC' },
    });

    return paginate(data, total, Number(limit), Number(offset));
  }

  async findOne(id: string, currentUser: User): Promise<Employer> {
    if (currentUser.role === UserRole.EMPLOYER && currentUser.employerId !== id) {
      throw new ForbiddenException('You can only access your own employer record');
    }

    const employer = await this.employerRepo.findOne({
      where: {
        id,
        // Employer users should not see deleted records even if they know the ID
        ...(currentUser.role === UserRole.EMPLOYER ? { status: Not(EmployerStatus.DELETED) } : {}),
      },
      relations: ['employees'],
    });

    if (!employer) {
      throw new NotFoundException(`Employer with id ${id} not found`);
    }

    return employer;
  }

  async update(id: string, dto: UpdateEmployerDto, currentUser: User): Promise<Employer> {
    const employer = await this.findOne(id, currentUser);

    if (currentUser.role === UserRole.EMPLOYER && dto.status) {
      throw new ForbiddenException('Only admins can change employer status');
    }

    // Prevent manually setting status to DELETED through the update endpoint
    if ((dto as any).status === EmployerStatus.DELETED) {
      throw new BadRequestException('Cannot set status to deleted.');
    }

    if (dto.tin && dto.tin !== employer.tin) {
      const conflict = await this.employerRepo.findOne({ where: { tin: dto.tin } });
      if (conflict) {
        throw new ConflictException(`TIN ${dto.tin} is already in use`);
      }
    }

    Object.assign(employer, dto);
    return this.employerRepo.save(employer);
  }

  /**
   * Soft-deletes an employer by setting its status to DELETED and recording the deletion timestamp.
   * Also soft-deletes the linked user account and all active employees of this employer to maintain data integrity.
   * All operations are performed within a transaction to ensure atomicity.
   *
   * @param id - The ID of the employer to delete
   * @throws NotFoundException if the employer does not exist or is already deleted
   */
  async remove(id: string): Promise<void> {
    const employer = await this.employerRepo.findOne({ where: { id } });
    if (!employer || employer.status === EmployerStatus.DELETED) {
      throw new NotFoundException(`Employer with id ${id} not found`);
    }

    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      // 1. Soft-delete the employer
      await manager.update(Employer, id, {
        status: EmployerStatus.DELETED,
        deletedAt: now,
      });

      // 2. Soft-delete the linked user account so their JWT stops working
      //    on next validation (JwtStrategy checks status === ACTIVE)
      await manager.update(
        User,
        { employerId: id, status: UserStatus.ACTIVE },
        { status: UserStatus.DELETED, deletedAt: now },
      );

      // 3. Soft-delete all active employees of this employer
      await manager.update(
        'employees',
        { employer_id: id, status: EmployeeStatus.ACTIVE },
        { status: EmployeeStatus.DELETED, deleted_at: now },
      );
    });
  }

  async suspend(id: string): Promise<Employer> {
    const employer = await this.employerRepo.findOne({ where: { id } });
    if (!employer || employer.status === EmployerStatus.DELETED) {
      throw new NotFoundException(`Employer with id ${id} not found`);
    }
    employer.status = EmployerStatus.SUSPENDED;
    return this.employerRepo.save(employer);
  }
}
