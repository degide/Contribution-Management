import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateEmployeeDto {
  @ApiProperty({ example: '1198780123456789', description: 'Rwanda National ID (16 digits)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{16}$/, { message: 'National ID must be exactly 16 digits' })
  nationalId: string;

  @ApiProperty({ example: 'Jean' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Habimana' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ example: '1990-05-15', description: 'Date of birth (YYYY-MM-DD)' })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ example: '2020-01-01', description: 'Hire date (YYYY-MM-DD)' })
  @IsDateString()
  hireDate: string;

  @ApiProperty({ example: 450000, description: 'Gross monthly salary in RWF' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  grossSalary: number;

  @ApiProperty({ description: 'Employer UUID this employee belongs to' })
  @IsUUID()
  employerId: string;

  @ApiPropertyOptional({ example: 'jean@company.rw' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether default medical contribution (RSSB) applies. Set false when the employee is ' +
      'covered by a private/alternative insurance scheme (e.g. Eden care).',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? true)
  enrolledMedical?: boolean;

  @ApiPropertyOptional({
    default: true,
    description:
      'Whether maternity contribution applies. Typically false for male employees ' +
      'or specific contract types ineligible for maternity benefits.',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? true)
  enrolledMaternity?: boolean;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class EmployeeQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employerId?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  offset?: number;
}
