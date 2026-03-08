import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Employer, EmployerStatus } from './entities/employer.entity';
import {
  CreateEmployerDto,
  UpdateEmployerDto,
  EmployerQueryDto,
  CreateEmployerResponseDto,
} from './dto/employer.dto';
import { paginate, PaginatedResponse } from '../common/dto/pagination.dto';
import { User, UserRole } from '../users/entities/user.entity';

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
    const tinConflict = await this.employerRepo.findOne({ where: { tin: dto.tin } });
    if (tinConflict) {
      throw new ConflictException(`Employer with TIN ${dto.tin} already exists`);
    }

    const emailConflict = await this.userRepo.findOne({ where: { email: dto.accountEmail } });
    if (emailConflict) {
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
      });
      const savedEmployer = await manager.save(Employer, employer);

      // 2. Create linked user account
      const user = manager.create(User, {
        email: dto.accountEmail,
        password: hashedPassword,
        role: UserRole.EMPLOYER,
        employerId: savedEmployer.id,
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

    const where: FindOptionsWhere<Employer> = {};
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
      where: { id },
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

    if (dto.tin && dto.tin !== employer.tin) {
      const conflict = await this.employerRepo.findOne({ where: { tin: dto.tin } });
      if (conflict) {
        throw new ConflictException(`TIN ${dto.tin} is already in use`);
      }
    }

    Object.assign(employer, dto);
    return this.employerRepo.save(employer);
  }

  async remove(id: string): Promise<void> {
    const employer = await this.employerRepo.findOne({ where: { id } });
    if (!employer) {
      throw new NotFoundException(`Employer with id ${id} not found`);
    }
    // Also remove the linked user account so the credentials stop working
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(User, { employerId: id });
      await manager.remove(Employer, employer);
    });
  }

  async suspend(id: string): Promise<Employer> {
    const employer = await this.employerRepo.findOne({ where: { id } });
    if (!employer) {
      throw new NotFoundException(`Employer with id ${id} not found`);
    }
    employer.status = EmployerStatus.SUSPENDED;
    return this.employerRepo.save(employer);
  }
}
