import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { paginate, PaginatedResponse } from '../common/dto/pagination.dto';

export interface LogEntry {
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export interface AuditQuery {
  userId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /**
   * Write an audit log entry. Never throws, never blocks the caller.
   *
   * @param entry The log entry to write. All fields optional except `action`. Timestamps are automatic.
   *              `before` and `after` can be full DB rows or just changed fields, as desired.
   */
  async log(entry: LogEntry): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          userId: entry.userId ?? undefined,
          userEmail: entry.userEmail ?? null,
          userRole: entry.userRole ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          before: entry.before ?? null,
          after: entry.after ?? null,
          ipAddress: entry.ipAddress ?? null,
        }),
      );
    } catch (err) {
      this.logger.error(`Audit write failed [${entry.action}]: ${err.message}`);
    }
  }

  async findAll(query: AuditQuery): Promise<PaginatedResponse<AuditLog>> {
    const limit = Number(query.limit ?? 20);
    const offset = Number(query.offset ?? 0);

    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC');

    if (query.userId) qb.andWhere('log.userId = :userId', { userId: query.userId });
    if (query.action) qb.andWhere('log.action ILIKE :action', { action: `%${query.action}%` });
    if (query.targetType)
      qb.andWhere('log.targetType ILIKE :targetType', { targetType: `%${query.targetType}%` });
    if (query.targetId) qb.andWhere('log.targetId = :targetId', { targetId: query.targetId });
    if (query.from) qb.andWhere('log.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('log.createdAt <= :to', { to: new Date(query.to) });

    qb.take(limit).skip(offset);

    const [data, total] = await qb.getManyAndCount();
    return paginate(data, total, limit, offset);
  }
}
