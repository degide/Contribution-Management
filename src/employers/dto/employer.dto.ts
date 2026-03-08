import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmployerSector, EmployerStatus } from '../entities/employer.entity';

export class CreateEmployerDto {
  @ApiProperty({ example: 'Rwanda Tea Company Ltd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '100123456', description: 'Tax Identification Number (unique)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{9}$/, { message: 'TIN must be exactly 9 digits' })
  tin: string;

  @ApiProperty({ enum: EmployerSector, example: EmployerSector.PRIVATE })
  @IsEnum(EmployerSector)
  sector: EmployerSector;

  @ApiPropertyOptional({ example: '+250788123456' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'KG 123 St, Kigali' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    example: 'employer@rwandatea.rw',
    description: "Email address that will be used as the employer's login",
  })
  @IsEmail()
  accountEmail: string;

  @ApiProperty({
    example: 'Temp@1234!',
    minLength: 8,
    description: 'Initial password. Employer should change this after first login.',
  })
  @IsString()
  @MinLength(8)
  accountPassword: string;
}

export class UpdateEmployerDto extends PartialType(
  OmitType(CreateEmployerDto, ['accountEmail', 'accountPassword'] as const),
) {
  @ApiPropertyOptional({ enum: EmployerStatus })
  @IsOptional()
  @IsEnum(EmployerStatus)
  status?: EmployerStatus;
}

export class EmployerQueryDto {
  @ApiPropertyOptional({ enum: EmployerStatus })
  @IsOptional()
  @IsEnum(EmployerStatus)
  status?: EmployerStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  offset?: number;
}

export class CreateEmployerResponseDto {
  @ApiProperty()
  employer: {
    id: string;
    name: string;
    tin: string;
    sector: EmployerSector;
    status: EmployerStatus;
  };

  @ApiProperty({
    description:
      'Login credentials for the employer account. The employer should change the temporary password after first login.',
  })
  account: {
    id: string;
    email: string;
    temporaryPassword: string;
  };
}
