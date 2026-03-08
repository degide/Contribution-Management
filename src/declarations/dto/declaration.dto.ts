import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeclarationStatus } from '../entities/declaration.entity';

// DTO for each employee line in a declaration
export class ContributionLineInputDto {
  @ApiProperty({ description: 'Employee UUID' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({
    example: 450000,
    description: 'Gross salary for this period (overrides employee base salary if provided)',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  grossSalary: number;
}

export class CreateDeclarationDto {
  @ApiProperty({ description: 'Employer UUID' })
  @IsUUID()
  employerId: string;

  @ApiProperty({ example: '2024-01', description: 'Declaration period (YYYY-MM)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'Period must be in YYYY-MM format (e.g. 2024-01)',
  })
  period: string;

  @ApiProperty({
    type: [ContributionLineInputDto],
    description: 'Employee contribution lines',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContributionLineInputDto)
  lines: ContributionLineInputDto[];
}

export class UpdateDeclarationLinesDto {
  @ApiProperty({ type: [ContributionLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContributionLineInputDto)
  lines: ContributionLineInputDto[];
}

export class RejectDeclarationDto {
  @ApiProperty({ example: 'Incorrect salary values for 2 employees' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class DeclarationQueryDto {
  @ApiPropertyOptional({ enum: DeclarationStatus })
  @IsOptional()
  @IsEnum(DeclarationStatus)
  status?: DeclarationStatus;

  @ApiPropertyOptional({ example: '2024-01', description: 'Filter by period' })
  @IsOptional()
  @IsString()
  period?: string;

  @ApiPropertyOptional({ description: 'Filter by employer ID (admin only)' })
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

export class ContributionSummaryQueryDto {
  @ApiPropertyOptional({ example: '2024-01', description: 'Start period (YYYY-MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use YYYY-MM format' })
  from?: string;

  @ApiPropertyOptional({ example: '2024-12', description: 'End period (YYYY-MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use YYYY-MM format' })
  to?: string;
}
