import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Employer, EmployerStatus } from './entities/employer.entity';
import { CreateEmployerDto, UpdateEmployerDto, EmployerQueryDto } from './dto/employer.dto';
import { paginate, PaginatedResponse } from '../common/dto/pagination.dto';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class EmployersService {
  constructor(
    @InjectRepository(Employer)
    private readonly employerRepo: Repository<Employer>,
  ) {}

  async create(dto: CreateEmployerDto): Promise<Employer> {
    const existing = await this.employerRepo.findOne({ where: { tin: dto.tin } });
    if (existing) {
      throw new ConflictException(`Employer with TIN ${dto.tin} already exists`);
    }

    const employer = this.employerRepo.create(dto);
    return this.employerRepo.save(employer);
  }

  async findAll(
    query: EmployerQueryDto,
    currentUser: User,
  ): Promise<PaginatedResponse<Employer>> {
    const { limit = 10, offset = 0, status, search } = query;

    // Employer users can only see their own record
    if (currentUser.role === UserRole.EMPLOYER) {
      const employer = await this.findOne(currentUser.employerId, currentUser);
      return paginate([employer], 1, limit, offset);
    }

    const where: any = {};
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
    // Employer users can only access their own record
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

    // Employers cannot change their own status — admin only
    if (currentUser.role === UserRole.EMPLOYER && dto.status) {
      throw new ForbiddenException('Only admins can change employer status');
    }

    // TIN uniqueness check if changing TIN
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
    await this.employerRepo.remove(employer);
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
