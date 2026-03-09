import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Declaration, DeclarationStatus } from './entities/declaration.entity';
import { ContributionLine } from './entities/contribution-line.entity';
import { Employee, EmployeeStatus } from '../employees/entities/employee.entity';
import { Employer, EmployerStatus } from '../employers/entities/employer.entity';
import {
  CreateDeclarationDto,
  UpdateDeclarationLinesDto,
  RejectDeclarationDto,
  DeclarationQueryDto,
  ContributionSummaryQueryDto,
  ContributionLineInputDto,
} from './dto/declaration.dto';
import { paginate, PaginatedResponse } from '../common/dto/pagination.dto';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class DeclarationsService {
  constructor(
    @InjectRepository(Declaration)
    private readonly declarationRepo: Repository<Declaration>,
    @InjectRepository(ContributionLine)
    private readonly lineRepo: Repository<ContributionLine>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Employer)
    private readonly employerRepo: Repository<Employer>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Creates a new declaration with associated contribution lines.
   * Validations:
   *   - Employer must exist and be active
   *   - No existing declaration for same employer + period
   *   - Each line's employee must exist and belong to the employer
   * Transactionally creates declaration and lines, then calculates totals.
   * Initial status is DRAFT.
   */
  async create(dto: CreateDeclarationDto, currentUser: User): Promise<Declaration> {
    // Authorization: employer can only create for themselves
    if (currentUser.role === UserRole.EMPLOYER && currentUser.employerId !== dto.employerId) {
      throw new ForbiddenException('You can only create declarations for your own company');
    }

    // Validate employer exists and is active
    const employer = await this.employerRepo.findOne({
      where: { id: dto.employerId, status: EmployerStatus.ACTIVE },
    });
    if (!employer) throw new NotFoundException(`Employer ${dto.employerId} not found`);
    if (employer.status === EmployerStatus.SUSPENDED) {
      throw new BadRequestException('Suspended employers cannot create declarations');
    }

    // Duplicate prevention: one declaration per employer per period
    const duplicate = await this.declarationRepo.findOne({
      where: { employerId: dto.employerId, period: dto.period },
    });

    if (duplicate) {
      throw new ConflictException(
        `A declaration for period ${dto.period} already exists (id: ${duplicate.id}, status: ${duplicate.status})`,
      );
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one contribution line is required');
    }

    // Use a transaction to create declaration + lines atomically
    const newDeclaration = await this.dataSource.transaction(async (manager) => {
      const declaration = manager.create(Declaration, {
        employerId: dto.employerId,
        period: dto.period,
        status: DeclarationStatus.DRAFT,
      });
      // paymentNumber is generated via @BeforeInsert
      const savedDeclaration = await manager.save(Declaration, declaration);

      const lines = await this.buildContributionLines(
        savedDeclaration.id,
        dto.employerId,
        dto.lines,
      );

      const savedLines = await manager.save(ContributionLine, lines);
      await this.recalculateTotals(manager, savedDeclaration, savedLines);

      return manager.findOne(Declaration, {
        where: { id: savedDeclaration.id },
        relations: ['contributionLines', 'contributionLines.employee', 'employer'],
      });
    });

    if (!newDeclaration) {
      throw new InternalServerErrorException('Failed to create declaration');
    }

    return newDeclaration;
  }

  /**
   * Updates contribution lines for a draft declaration.
   * @param id - The declaration ID
   * @param dto - The update DTO
   * @param currentUser - The current user
   * @returns The updated declaration
   */
  async updateLines(
    id: string,
    dto: UpdateDeclarationLinesDto,
    currentUser: User,
  ): Promise<Declaration> {
    const declaration = await this.getDeclarationWithOwnerCheck(id, currentUser);

    if (declaration.status !== DeclarationStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot edit a declaration with status: ${declaration.status}. Only DRAFT declarations can be modified.`,
      );
    }

    const updatedDeclaration = await this.dataSource.transaction(async (manager) => {
      // Remove existing lines and replace
      await manager.delete(ContributionLine, { declarationId: id });

      const newLines = await this.buildContributionLines(id, declaration.employerId, dto.lines);

      const savedLines = await manager.save(ContributionLine, newLines);
      await this.recalculateTotals(manager, declaration, savedLines);

      return manager.findOne(Declaration, {
        where: { id },
        relations: ['contributionLines', 'contributionLines.employee', 'employer'],
      });
    });

    if (!updatedDeclaration) {
      throw new InternalServerErrorException('Failed to update declaration lines');
    }

    return updatedDeclaration;
  }

  /**
   * Submits a draft declaration for review.
   * @param id - The declaration ID
   * @param currentUser - The current user
   * @returns The submitted declaration
   */
  async submit(id: string, currentUser: User): Promise<Declaration> {
    const declaration = await this.getDeclarationWithOwnerCheck(id, currentUser);

    if (declaration.status !== DeclarationStatus.DRAFT) {
      throw new BadRequestException(`Cannot submit declaration with status: ${declaration.status}`);
    }

    const lineCount = await this.lineRepo.count({ where: { declarationId: id } });
    if (lineCount === 0) {
      throw new BadRequestException('Cannot submit an empty declaration');
    }

    declaration.status = DeclarationStatus.SUBMITTED;
    declaration.submittedAt = new Date();
    return this.declarationRepo.save(declaration);
  }

  /**
   * Validates a submitted declaration.
   * @param id - The declaration ID
   * @returns The validated declaration
   */
  async validate(id: string): Promise<Declaration> {
    const declaration = await this.declarationRepo.findOne({ where: { id } });
    if (!declaration) throw new NotFoundException(`Declaration ${id} not found`);

    if (declaration.status !== DeclarationStatus.SUBMITTED) {
      throw new BadRequestException(
        `Can only validate SUBMITTED declarations. Current status: ${declaration.status}`,
      );
    }

    declaration.status = DeclarationStatus.VALIDATED;
    declaration.validatedAt = new Date();
    return this.declarationRepo.save(declaration);
  }

  /**
   * Rejects a submitted declaration.
   * @param id - The declaration ID
   * @param dto - The reject DTO
   * @returns The rejected declaration
   */
  async reject(id: string, dto: RejectDeclarationDto): Promise<Declaration> {
    const declaration = await this.declarationRepo.findOne({ where: { id } });
    if (!declaration) throw new NotFoundException(`Declaration ${id} not found`);

    if (declaration.status !== DeclarationStatus.SUBMITTED) {
      throw new BadRequestException(
        `Can only reject SUBMITTED declarations. Current status: ${declaration.status}`,
      );
    }

    declaration.status = DeclarationStatus.REJECTED;
    declaration.rejectionReason = dto.reason;
    return this.declarationRepo.save(declaration);
  }

  /**
   * Finds all declarations matching the query criteria.
   * @param query - The query parameters
   * @param currentUser - The current user
   * @returns A paginated list of declarations
   */
  async findAll(
    query: DeclarationQueryDto,
    currentUser: User,
  ): Promise<PaginatedResponse<Declaration>> {
    const { limit = 10, offset = 0, status, period, employerId } = query;

    const qb = this.declarationRepo
      .createQueryBuilder('declaration')
      .leftJoinAndSelect('declaration.employer', 'employer')
      .leftJoinAndSelect('declaration.contributionLines', 'lines')
      .orderBy('declaration.createdAt', 'DESC');

    // Scope to own declarations for employer role
    if (currentUser.role === UserRole.EMPLOYER) {
      qb.andWhere('declaration.employerId = :empId', { empId: currentUser.employerId });
    } else if (employerId) {
      qb.andWhere('declaration.employerId = :empId', { empId: employerId });
    }

    if (status) qb.andWhere('declaration.status = :status', { status });
    if (period) qb.andWhere('declaration.period = :period', { period });

    qb.take(Number(limit)).skip(Number(offset));

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, Number(limit), Number(offset));
  }

  /**
   * Finds a single declaration by ID.
   * @param id - The declaration ID
   * @param currentUser - The current user
   * @returns The declaration
   */
  async findOne(id: string, currentUser: User): Promise<Declaration> {
    return this.getDeclarationWithOwnerCheck(id, currentUser);
  }

  /**
   * Retrieves a contribution summary for an employer.
   * @param employerId - The employer ID
   * @param query - The query parameters
   * @param currentUser - The current user
   * @returns The contribution summary
   */
  async getContributionSummary(
    employerId: string,
    query: ContributionSummaryQueryDto,
    currentUser: User,
  ) {
    // Scoping check
    if (currentUser.role === UserRole.EMPLOYER && currentUser.employerId !== employerId) {
      throw new ForbiddenException('You can only view your own contribution summary');
    }

    const employer = await this.employerRepo.findOne({ where: { id: employerId } });
    if (!employer) throw new NotFoundException(`Employer ${employerId} not found`);

    const qb = this.declarationRepo
      .createQueryBuilder('d')
      .select('d.period', 'period')
      .addSelect('d.status', 'status')
      .addSelect('d.paymentNumber', 'paymentNumber')
      .addSelect('d.grandTotal', 'grandTotal')
      .addSelect('d.totalPension', 'totalPension')
      .addSelect('d.totalMedical', 'totalMedical')
      .addSelect('d.totalMaternity', 'totalMaternity')
      .addSelect('d.submittedAt', 'submittedAt')
      .addSelect('COUNT(lines.id)', 'employeeCount')
      .leftJoin('d.contributionLines', 'lines')
      .where('d.employerId = :employerId', { employerId })
      .andWhere('d.status IN (:...statuses)', {
        statuses: [DeclarationStatus.SUBMITTED, DeclarationStatus.VALIDATED],
      })
      .groupBy('d.id')
      .orderBy('d.period', 'DESC');

    if (query.from) qb.andWhere('d.period >= :from', { from: query.from });
    if (query.to) qb.andWhere('d.period <= :to', { to: query.to });

    const rows = await qb.getRawMany();

    // Aggregate totals across the filtered range
    const totals = rows.reduce(
      (acc, row) => ({
        totalPension: acc.totalPension + parseFloat(row.totalPension ?? 0),
        totalMedical: acc.totalMedical + parseFloat(row.totalMedical ?? 0),
        totalMaternity: acc.totalMaternity + parseFloat(row.totalMaternity ?? 0),
        grandTotal: acc.grandTotal + parseFloat(row.grandTotal ?? 0),
      }),
      { totalPension: 0, totalMedical: 0, totalMaternity: 0, grandTotal: 0 },
    );

    return {
      employer: { id: employer.id, name: employer.name, tin: employer.tin },
      filter: { from: query.from ?? null, to: query.to ?? null },
      monthlyBreakdown: rows.map((r) => ({
        period: r.period,
        status: r.status,
        paymentNumber: r.paymentNumber,
        employeeCount: parseInt(r.employeeCount),
        totalPension: parseFloat(r.totalPension),
        totalMedical: parseFloat(r.totalMedical),
        totalMaternity: parseFloat(r.totalMaternity),
        grandTotal: parseFloat(r.grandTotal),
        submittedAt: r.submittedAt,
      })),
      aggregateTotals: {
        totalPension: Math.round(totals.totalPension * 100) / 100,
        totalMedical: Math.round(totals.totalMedical * 100) / 100,
        totalMaternity: Math.round(totals.totalMaternity * 100) / 100,
        grandTotal: Math.round(totals.grandTotal * 100) / 100,
      },
    };
  }

  /**
   * Helper method to retrieve a declaration with access control check.
   * Throws NotFound if declaration doesn't exist, or Forbidden if employer user tries to access another employer's declaration.
   * @param id - The declaration ID
   * @param currentUser - The current user
   * @returns The declaration with relations loaded
   */
  private async getDeclarationWithOwnerCheck(id: string, currentUser: User): Promise<Declaration> {
    const declaration = await this.declarationRepo.findOne({
      where: { id },
      relations: ['contributionLines', 'contributionLines.employee', 'employer'],
    });

    if (!declaration) throw new NotFoundException(`Declaration ${id} not found`);

    if (
      currentUser.role === UserRole.EMPLOYER &&
      declaration.employerId !== currentUser.employerId
    ) {
      throw new ForbiddenException('You do not have access to this declaration');
    }

    return declaration;
  }

  /**
   * Resolve enrollment and calculate contribution amounts for each input line.
   * Validations:
   *   - Employee must exist, be active, and belong to the employer
   *   - No duplicate employee IDs within the same declaration
   * Enrollment override logic:
   *   - If overrideMedical is provided, it takes priority over the employee's default enrolledMedical value for this period.
   *   - If overrideMaternity is provided, it takes priority over the employee's default enrolledMaternity value for this period.
   *   - This allows for flexible handling of mid-year insurance changes or exceptions.
   * @param declarationId - The declaration ID to associate the lines with
   * @param employerId - The employer ID for validation
   * @param inputs - The contribution line input DTOs
   * @returns An array of ContributionLine entities ready to be saved
   */
  private async buildContributionLines(
    declarationId: string,
    employerId: string,
    inputs: ContributionLineInputDto[],
  ): Promise<ContributionLine[]> {
    // Reject duplicate employee IDs within the same declaration
    const seen = new Set<string>();
    for (const input of inputs) {
      if (seen.has(input.employeeId)) {
        throw new BadRequestException(
          `Employee ${input.employeeId} appears more than once in lines`,
        );
      }
      seen.add(input.employeeId);
    }

    const lines: ContributionLine[] = [];

    for (const input of inputs) {
      const employee = await this.employeeRepo.findOne({ where: { id: input.employeeId } });

      if (!employee || employee.status === EmployeeStatus.DELETED) {
        throw new NotFoundException(`Employee ${input.employeeId} not found`);
      }
      if (employee.employerId !== employerId) {
        throw new BadRequestException(
          `Employee ${input.employeeId} does not belong to this employer`,
        );
      }

      // An explicit override in the line DTO takes priority.
      // Falling back to undefined means "use the employee's stored default".
      const includeMedical = input.overrideMedical ?? employee.enrolledMedical;

      const includeMaternity = input.overrideMaternity ?? employee.enrolledMaternity;

      const calc = ContributionLine.calculate(input.grossSalary, includeMedical, includeMaternity);

      const line = new ContributionLine();
      line.declarationId = declarationId;
      line.employeeId = input.employeeId;
      line.grossSalary = input.grossSalary;
      line.pensionAmount = calc.pensionAmount;
      line.medicalAmount = calc.medicalAmount;
      line.maternityAmount = calc.maternityAmount;
      line.total = calc.total;
      line.includeMedical = includeMedical;
      line.includeMaternity = includeMaternity;
      line.note = input.note;

      lines.push(line);
    }

    return lines;
  }

  private async recalculateTotals(
    manager: EntityManager,
    declaration: Declaration,
    lines: ContributionLine[],
  ): Promise<void> {
    const round = (n: number) => Math.round(n * 100) / 100;
    await manager.update(Declaration, declaration.id, {
      totalPension: round(lines.reduce((s, l) => s + Number(l.pensionAmount), 0)),
      totalMedical: round(lines.reduce((s, l) => s + Number(l.medicalAmount), 0)),
      totalMaternity: round(lines.reduce((s, l) => s + Number(l.maternityAmount), 0)),
      grandTotal: round(lines.reduce((s, l) => s + Number(l.total), 0)),
    });
  }
}
