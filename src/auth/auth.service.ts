import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../users/entities/user.entity';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import { Employer } from '../employers/entities/employer.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Employer)
    private readonly employerRepo: Repository<Employer>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // If role is employer, validate employerId is provided and exists
    if (dto.role === UserRole.EMPLOYER) {
      if (!dto.employerId) {
        throw new BadRequestException('employerId is required for employer role');
      }
      const employer = await this.employerRepo.findOne({ where: { id: dto.employerId } });
      if (!employer) {
        throw new BadRequestException(`Employer with id ${dto.employerId} not found`);
      }
      // Check no user is already linked to this employer
      const linked = await this.userRepo.findOne({ where: { employerId: dto.employerId } });
      if (linked) {
        throw new ConflictException('An account is already linked to this employer');
      }
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.userRepo.create({
      email: dto.email,
      password: hashed,
      role: dto.role,
      employerId: dto.employerId,
    });

    const saved = await this.userRepo.save(user);
    return this.buildAuthResponse(saved);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User): AuthResponseDto {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      employerId: user.employerId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        employerId: user.employerId,
      },
    };
  }
}
