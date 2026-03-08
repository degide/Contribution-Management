import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
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
}

export class UpdateEmployerDto extends PartialType(CreateEmployerDto) {
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
