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
import {
  CreateEmployerDto,
  UpdateEmployerDto,
  EmployerQueryDto,
  CreateEmployerResponseDto,
} from './dto/employer.dto';
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
  @ApiOperation({
    summary: '[Admin] Register a new employer and create their login account',
    description:
      '**This is the employer onboarding endpoint.**\n\n' +
      'Creates the employer record and a linked user account in a single atomic operation.\n\n' +
      'The response includes a `temporaryPassword` to share this with the employer ' +
      'out-of-band (e.g. email). TODO: Implement in-app secure messaging for this purpose.\n\n' +
      'The employer can then log in with those credentials and is ready to go.',
  })
  @ApiResponse({
    status: 201,
    description: 'Employer registered and account created',
    type: CreateEmployerResponseDto,
  })
  @ApiResponse({ status: 409, description: 'TIN or email already exists' })
  create(@Body() dto: CreateEmployerDto): Promise<CreateEmployerResponseDto> {
    return this.employersService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List employers',
    description: 'Admins see all employers. An employer user sees only their own record.',
  })
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
  @ApiOperation({
    summary: 'Update employer business details',
    description: 'Credentials (email/password) are not updatable here.',
  })
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
  @ApiOperation({
    summary: '[Admin] Delete an employer and their linked user account',
  })
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
