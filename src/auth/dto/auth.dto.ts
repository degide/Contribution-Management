import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/entities/user.entity';

export class LoginDto {
  @ApiProperty({ example: 'admin@rssb.rw' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin1234!' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'employer@company.rw' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: UserRole, default: UserRole.EMPLOYER })
  @IsEnum(UserRole)
  role: UserRole;

  // Required when role = employer; links user to employer record
  @ApiProperty({ required: false, description: 'Employer ID (required if role is employer)' })
  @IsOptional()
  @IsUUID()
  employerId?: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  user: {
    id: string;
    email: string;
    role: UserRole;
    employerId?: string;
  };
}
