import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeclarationsService } from './declarations.service';
import {
  CreateDeclarationDto,
  UpdateDeclarationLinesDto,
  RejectDeclarationDto,
  DeclarationQueryDto,
  ContributionSummaryQueryDto,
} from './dto/declaration.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

@ApiTags('Declarations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('declarations')
export class DeclarationsController {
  constructor(private readonly declarationsService: DeclarationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new declaration (draft) with contribution lines' })
  @ApiResponse({ status: 201, description: 'Declaration created in DRAFT status' })
  @ApiResponse({ status: 409, description: 'Declaration for this period already exists' })
  create(@Body() dto: CreateDeclarationDto, @CurrentUser() user: User) {
    return this.declarationsService.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List declarations (scoped by role)' })
  findAll(@Query() query: DeclarationQueryDto, @CurrentUser() user: User) {
    return this.declarationsService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get declaration details with all contribution lines' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.declarationsService.findOne(id, user);
  }

  @Patch(':id/lines')
  @ApiOperation({ summary: 'Update contribution lines on a DRAFT declaration' })
  @ApiResponse({ status: 400, description: 'Cannot edit a non-draft declaration' })
  updateLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeclarationLinesDto,
    @CurrentUser() user: User,
  ) {
    return this.declarationsService.updateLines(id, dto, user);
  }

  @Patch(':id/submit')
  @ApiOperation({ summary: 'Submit a DRAFT declaration for review' })
  @ApiResponse({ status: 400, description: 'Declaration is not in DRAFT status' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.declarationsService.submit(id, user);
  }

  @Patch(':id/validate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Validate a SUBMITTED declaration' })
  validate(@Param('id', ParseUUIDPipe) id: string) {
    return this.declarationsService.validate(id);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Reject a SUBMITTED declaration with reason' })
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDeclarationDto) {
    return this.declarationsService.reject(id, dto);
  }
}

@ApiTags('Declarations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employers')
export class ContributionSummaryController {
  constructor(private readonly declarationsService: DeclarationsService) {}

  @Get(':employerId/contribution-summary')
  @ApiOperation({
    summary: 'Get employer contribution summary grouped by month',
    description:
      'Returns monthly breakdown of pension, medical, and maternity contributions. Supports optional date range filter via ?from=YYYY-MM&to=YYYY-MM',
  })
  getSummary(
    @Param('employerId', ParseUUIDPipe) employerId: string,
    @Query() query: ContributionSummaryQueryDto,
    @CurrentUser() user: User,
  ) {
    return this.declarationsService.getContributionSummary(employerId, query, user);
  }
}
