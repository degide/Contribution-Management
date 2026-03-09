import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { AuditService, AuditQuery } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

class AuditQueryDto implements AuditQuery {
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() targetType?: string;
  @IsOptional() @IsUUID() targetId?: string;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @Type(() => Number) limit?: number;
  @IsOptional() @Type(() => Number) offset?: number;
}

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: '[Admin] List audit logs',
    description: `
      Paginated, newest-first audit trail for every mutating request. 
      Passwords and \`password_hash\` are always stripped from both snapshots.
    `.trim(),
  })
  @ApiQuery({
    name: 'action',
    required: false,
    example: 'EMPLOYER_UPDATE',
    description: 'Partial match (case-insensitive)',
  })
  @ApiQuery({ name: 'targetType', required: false, example: 'Employer' })
  @ApiQuery({ name: 'targetId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false, example: '2025-01-01T00:00:00Z' })
  @ApiQuery({ name: 'to', required: false, example: '2025-12-31T23:59:59Z' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'offset', required: false, example: 0 })
  findAll(@Query() query: AuditQueryDto) {
    return this.auditService.findAll(query);
  }
}
