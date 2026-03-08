import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EmployersService } from './employers.service';
import { CreateEmployerDto, UpdateEmployerDto, EmployerQueryDto } from './dto/employer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';

@ApiTags('Employers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employers')
export class EmployersController {
  constructor(private readonly employersService: EmployersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Create a new employer' })
  @ApiResponse({ status: 201, description: 'Employer created' })
  @ApiResponse({ status: 409, description: 'TIN already exists' })
  create(@Body() dto: CreateEmployerDto) {
    return this.employersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List employers (admin sees all; employer sees only their own)' })
  findAll(@Query() query: EmployerQueryDto, @CurrentUser() user: User) {
    return this.employersService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get employer by ID' })
  @ApiResponse({ status: 404, description: 'Employer not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.employersService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update employer details' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployerDto,
    @CurrentUser() user: User,
  ) {
    return this.employersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Delete an employer' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.employersService.remove(id);
  }

  @Patch(':id/suspend')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Suspend an employer' })
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.employersService.suspend(id);
  }
}
