import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit.service';

/** Sensitive keys to omit from snapshots and responses. */
const SENSITIVE = new Set(['password', 'password_hash']);

function sanitize(val: unknown): unknown {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return (val as unknown[]).map(sanitize);
  return Object.fromEntries(
    Object.entries(val as Record<string, unknown>)
      .filter(([k]) => !SENSITIVE.has(k))
      .map(([k, v]) => [k, sanitize(v)]),
  );
}

/**
 * Converts method + Express route pattern into a clean action.
 *
 * Algorithm:
 *   1. Strip /api prefix, split on '/', drop empty + param (:id) segments.
 *   2. resource = first segment, singularised (strip trailing 's') + uppercased.
 *   3. If no sub-segments: map HTTP methods CREATE, UPDATE and DELETE.
 *   4. If sub-segments exist:
 *        – ends in plural noun (trailing 's') + PATCH/PUT  -> UPDATE_{NOUN}
 *        – verb (submit, validate, etc) or POST sub-route      -> use as-is
 */
function deriveAction(method: string, routePattern: string): string {
  const segments = routePattern
    .replace(/^\/api/, '')
    .split('/')
    .filter((s) => s && !s.startsWith(':'));

  if (!segments.length) return method;

  const [resource, ...rest] = segments;
  const resourceKey = resource.replace(/s$/, '').replace(/-/g, '_').toUpperCase();

  if (!rest.length) {
    const methodVerb: Record<string, string> = {
      POST: 'CREATE',
      DELETE: 'DELETE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
    };
    return `${resourceKey}_${methodVerb[method] ?? method}`;
  }

  const subKey = rest.map((s) => s.replace(/-/g, '_').toUpperCase()).join('_');
  const lastSub = rest[rest.length - 1];

  // Plural noun sub-resource + PATCH/PUT = data update
  if (['PATCH', 'PUT'].includes(method) && lastSub.endsWith('s')) {
    return `${resourceKey}_UPDATE_${subKey}`;
  }

  return `${resourceKey}_${subKey}`;
}

// Maps the first URL segment to its DB table. Only resources with a stable
// id-based primary key need be listed. Omitted segments are not snapshotted.
const SEGMENT_TABLE: Record<string, string> = {
  employers: 'employers',
  employees: 'employees',
  declarations: 'declarations',
  users: 'users',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();

    // Only capture state-mutating requests
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      return next.handle();
    }

    const routePattern: string = ((req as any).route?.path ?? req.path).replace(/^\/api/, '');

    const action = deriveAction(req.method, routePattern);
    const segments = routePattern.split('/').filter((s) => s && !s.startsWith(':'));
    const firstSeg = segments[0] ?? null;

    // Singular capitalised resource for targetType: employers -> Employer
    const targetType = firstSeg
      ? firstSeg.replace(/s$/, '').replace(/^./, (c) => c.toUpperCase())
      : null;

    const table = firstSeg ? (SEGMENT_TABLE[firstSeg] ?? null) : null;
    const paramId = req.params?.id ?? req.params?.employerId ?? null;
    const user = (req as any).user;
    const ip = req.ip ?? req.socket?.remoteAddress ?? null;

    // Fetch the before-state before the handler runs, then chain
    return from(this.snapshot(table, paramId as string | null)).pipe(
      switchMap((before) =>
        next.handle().pipe(
          tap((body) => {
            const after = body != null ? (sanitize(body) as Record<string, unknown>) : null;

            const targetId =
              paramId ??
              (body as any)?.id ??
              (body as any)?.employer?.id ??
              (body as any)?.user?.id ??
              null;

            this.auditService.log({
              userId: user?.id ?? null,
              userEmail: user?.email ?? null,
              userRole: user?.role ?? null,
              action,
              targetType,
              targetId: targetId as string | null | undefined,
              before,
              after,
              ipAddress: ip,
            });
          }),
        ),
      ),
    );
  }

  /**
   * Fetch the current DB row before the mutation runs.
   * Non-fatal. Any failure returns null so the request is never affected.
   */
  private async snapshot(
    table: string | null,
    id: string | null,
  ): Promise<Record<string, unknown> | null> {
    if (!table || !id) return null;
    try {
      const rows = await this.dataSource.query(`SELECT * FROM "${table}" WHERE id = $1 LIMIT 1`, [
        id,
      ]);
      return rows.length ? (sanitize(rows[0]) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
