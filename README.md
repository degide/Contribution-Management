# Employer Contribution Management API

A backend for an Employer Contribution Management System. Built with NestJS, TypeORM, and PostgreSQL.

## Quick Start

**With Docker (recommended):**

```bash
git clone https://github.com/degide/Contribution-Management.git
cd Contribution-Management
docker compose up --build
```

API: http://localhost:3000/api  
Swagger: http://localhost:3000/api/docs

**Without Docker:**
```bash
cp .env.example .env   # set DB credentials
npm install
npm run migration:run
npm run seed
npm run start:dev
```

## Setup Instructions

### Prerequisites
- Node.js 20+
- PostgreSQL 16+

### 1. Environment
```bash
cp .env.example .env
```

Edit `.env` with your database credentials. The defaults match the Docker Compose setup.

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | Postgres host |
| `DB_PORT` | `5432` | Postgres port |
| `DB_USERNAME` | `rssb_user` | Database user |
| `DB_PASSWORD` | `rssb_password` | Database password |
| `DB_NAME` | `rssb_db` | Database name |
| `DB_POOL_SIZE` | `10` | Connection pool size |
| `JWT_SECRET` | — | Required. Set a strong secret. |
| `JWT_EXPIRES_IN` | `24h` | Token lifetime |

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Setup
```bash
# Run all migrations (creates tables, indexes, enums)
npm run migration:run

# Seed demo data
npm run seed
```

### 4. Start the Server
```bash
npm run start:dev   # development (hot reload)
npm run start:prod  # production build
```

### 5. Swagger UI

Visit: **http://localhost:3000/api/docs**

Seed credentials:

| Role | Email | Password |
|------|-------|----------|
| admin | `admin@rssb.rw` | `Admin1234!` |
| employer | `employer@kigalitea.rw` | `Employer1234!` |
| employer | `employer@rwconstruct.rw` | `Employer2nd!` |

### 6. Tests
```bash
npm run test         # unit tests
npm run test:e2e     # end-to-end tests (requires a running DB)
npm run test:cov     # coverage report
```

## API Overview

All endpoints are prefixed with `/api`. JWT Bearer token required on all endpoints except `POST /auth/login`.

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | public | Login -> JWT |
| POST | `/auth/register-admin` | admin | Create admin account |

### Employers
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/employers` | admin | Onboard employer + create login atomically |
| GET | `/employers` | any | List (admin sees all; employer sees own) |
| GET | `/employers/:id` | any | Get employer |
| PATCH | `/employers/:id` | any | Update business details |
| DELETE | `/employers/:id` | admin | Soft-delete (cascades to linked user + employees) |
| PATCH | `/employers/:id/suspend` | admin | Suspend employer |
| GET | `/employers/:id/contribution-summary` | any | Monthly breakdown with optional `?from=YYYY-MM&to=YYYY-MM` |

### Employees
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/employees` | any | Register employee |
| GET | `/employees` | any | List (scoped to employer) |
| GET | `/employees/:id` | any | Get employee |
| PATCH | `/employees/:id` | any | Update (includes enrollment defaults) |
| DELETE | `/employees/:id` | any | Soft-delete (row retained for audit) |

### Declarations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/declarations` | any | Create draft declaration |
| GET | `/declarations` | any | List (scoped by role) |
| GET | `/declarations/:id` | any | Get declaration with all contribution lines |
| PATCH | `/declarations/:id/lines` | employer | Replace lines (draft only) |
| PATCH | `/declarations/:id/submit` | employer | Submit for admin review |
| PATCH | `/declarations/:id/validate` | admin | Approve |
| PATCH | `/declarations/:id/reject` | admin | Reject with reason |

### Audit Logs
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/audit-logs` | admin | Paginated audit trail with before/after snapshots |

Supports filters: `?action=EMPLOYER_UPDATE`, `?targetType=Employer`, `?targetId=<uuid>`, `?userId=<uuid>`, `?from=<ISO-8601>&to=<ISO-8601>`

All list endpoints accept `?limit=10&offset=0`.

## Architecture Decisions

### 1. Module-per-Domain
Each domain (auth, employers, employees, declarations, audit) is a self-contained NestJS module with its own controller, service, DTOs, and entities. This makes each domain testable in isolation and easy to locate when something needs changing.

### 2. Atomic Employer Onboarding
`POST /employers` creates both the employer record and its linked user account inside a single `DataSource.transaction()`. If either insert fails, duplicate TIN, duplicate email, the whole operation rolls back cleanly. This means there is no state where an employer record exists without a login, or vice versa.

### 3. Transaction-Backed Declaration Creation
A single declaration write touches three things: the declaration row, all contribution lines, and the cached totals. All three are wrapped in one transaction so it is impossible to have a declaration with missing lines or stale totals due to a partial failure.

### 4. Cached Totals on Declaration
The `declarations` table stores pre-computed `total_pension`, `total_medical`, `total_maternity`, and `grand_total` columns, recalculated whenever lines change. The alternative, summing lines at query time, is wasteful when the contribution summary endpoint aggregates across many declarations at once.

### 5. Declaration Status Machine
```
DRAFT -> SUBMITTED -> VALIDATED -> REJECTED
```
Transitions are enforced in the service layer. Employers can only submit from DRAFT; admins can only validate or reject from SUBMITTED. Once submitted, lines cannot be edited. A rejected declaration is terminal, the employer creates a fresh one.

### 6. Soft Delete Across All Resources
No row is ever hard-deleted. Employers, employees, and users all get a `status = 'deleted'` flag and a `deleted_at` timestamp instead. This preserves foreign key integrity (declared contribution lines still reference their employees), keeps the full history intact, and means deleted records are excluded from all list and lookup queries at the service layer, not the database layer, so the data is always recoverable.

Deleting an employer cascades in a single transaction: the employer, its linked user account, and all active employees are soft-deleted together. A deleted user's JWT is rejected immediately on the next request, the strategy checks `status === 'active'` on every token validation rather than waiting for the token to expire.

### 7. Contribution Enrollment Defaults with Per-Period Overrides
Each employee carries two enrollment flags, `enrolledMedical` and `enrolledMaternity`, that represent their standing default across all future declarations. These are set once (e.g. `enrolledMedical: false` for an employee on a private insurance scheme) and automatically applied when declaration lines are built.

A per-line override (`overrideMedical`, `overrideMaternity`) can flip the default for a single declaration period without changing the employee record. The resolution rule is simple: the override wins when present; the employee default applies otherwise.

Once a declaration line is created, its `includeMedical` and `includeMaternity` flags are frozen. Later changes to the employee's defaults do not retroactively affect past declarations.

### 8. Global Audit Interceptor, No Decorators
Every mutating request (`POST`, `PATCH`, `PUT`, `DELETE`) is audited automatically by a single `APP_INTERCEPTOR` registered in `AppModule`. No controller or service needs to know auditing exists.

The interceptor derives a human-readable action name from the HTTP method and the matched Express route pattern:

```
POST   /employers                 -> EMPLOYER_CREATE
PATCH  /employers/:id/suspend     -> EMPLOYER_SUSPEND
PATCH  /declarations/:id/lines    -> DECLARATION_UPDATE_LINES
PATCH  /declarations/:id/validate -> DECLARATION_VALIDATE
```

Before the handler runs, it fetches the current DB row (`before_state`). After the handler responds, it captures the response body (`after_state`). Both are stored as top-level JSONB columns on the audit log, not nested inside a generic metadata blob, so they can be queried directly in Postgres:

```sql
SELECT * FROM audit_logs
WHERE before_state->>'status' = 'draft'
  AND after_state->>'status'  = 'submitted';
```

Passwords and `password_hash` values are stripped from every snapshot recursively before storage. The audit write is fire-and-forget, a failure writing to `audit_logs` never affects the response.

### 9. Connection Pooling
The TypeORM connection pool size is configurable via `DB_POOL_SIZE` (default `10`). Worth noting: the audit interceptor performs a `SELECT` against the DB before every mutating request (to capture `before_state`), so at peak load each audit-eligible request momentarily holds two connections from the pool, one for the snapshot, one for the handler. Keep this in mind when sizing the pool under concurrent load; `20` is a reasonable starting point for production.

### 10. Service-Layer Data Scoping
Role enforcement happens in the service layer, not only at the guard level. An employer user is silently filtered to their own resources regardless of which ID they pass in the URL. This means a misconfigured guard cannot accidentally expose another employer's data.

### 11. Separate ContributionSummaryController
The `GET /employers/:id/contribution-summary` endpoint is implemented as a second controller inside `DeclarationsModule` rather than adding declaration logic to `EmployersController`. NestJS supports multiple controllers per module cleanly, and this keeps each module's controller focused on one resource type.

## Database Design

### Schema Overview

```
users           : login credentials + role + employer FK
employers       : business registration, status, sector
employees       : person data, salary, enrollment flags, employer FK
declarations    : period, status workflow, cached totals, employer FK
contribution_lines : per-employee amounts for a declaration, enrollment snapshot
audit_logs      : immutable record of every mutating request
```

### Indexes

```sql
-- Employer TIN is globally unique (Rwanda Revenue Authority format)
CREATE UNIQUE INDEX "UQ_employers_tin" ON employers (tin);

-- National ID uniquely identifies a person across all employers
CREATE UNIQUE INDEX "UQ_employees_national_id" ON employees (national_id);

-- Most employee queries filter by employer
CREATE INDEX "IDX_employees_employer_id" ON employees (employer_id);

-- Core business rule: one declaration per employer per period
CREATE UNIQUE INDEX "UQ_declaration_employer_period" ON declarations (employer_id, period);

-- Contribution summary queries always filter on (employer_id, period)
CREATE INDEX "IDX_declarations_employer_period" ON declarations (employer_id, period);

-- Admin dashboard filters by status
CREATE INDEX "IDX_declarations_status" ON declarations (status);

-- Line lookups always start with declaration_id
CREATE INDEX "IDX_contribution_lines_declaration" ON contribution_lines (declaration_id);

-- Prevents an employee appearing twice in the same declaration
CREATE UNIQUE INDEX "UQ_contribution_line_declaration_employee"
  ON contribution_lines (declaration_id, employee_id);

-- Audit lookups: by actor, action type, target resource, or time window
CREATE INDEX "IDX_audit_user_id"    ON audit_logs (user_id);
CREATE INDEX "IDX_audit_action"     ON audit_logs (action);
CREATE INDEX "IDX_audit_target"     ON audit_logs (target_type, target_id);
CREATE INDEX "IDX_audit_created_at" ON audit_logs (created_at DESC);

-- Partial indexes to filter out soft-deleted records efficiently
CREATE INDEX "IDX_users_status"      ON users      (status) WHERE status = 'active';
CREATE INDEX "IDX_employees_status"  ON employees  (status) WHERE status = 'active';
CREATE INDEX "IDX_employers_status"  ON employers  (status) WHERE status != 'deleted';
```

## Contribution Calculation

```
Pension   = gross_salary × 6.0%   (always applied)
Medical   = gross_salary × 7.5%   (zero if employee opted out)
Maternity = gross_salary × 0.3%   (zero if employee not eligible)
```

Example for a salary of 500,000 RWF with full enrollment:

| Type | Rate | Amount (RWF) |
|------|------|-------------|
| Pension | 6% | 30,000 |
| Medical Insurance | 7.5% | 37,500 |
| Maternity Leave | 0.3% | 1,500 |
| **Total** | **13.8%** | **69,000** |

An employee on private insurance (`enrolledMedical: false`) with the same salary contributes only 31,500 RWF (pension + maternity only). The rates are defined as named constants in `contribution-line.entity.ts` so a future rate change is a single-file edit.

## Business Rules

| Rule | Enforcement |
|------|-------------|
| Unique TIN per employer | DB unique index + service check |
| Unique national ID per employee | DB unique index + service check |
| National ID remains reserved after soft-delete | No hard delete; unique index always holds |
| One declaration per employer per period | DB composite unique index + service check |
| Unique payment number | DB unique index + `@BeforeInsert` generator |
| Draft-only line edits | Service layer state check |
| Cannot submit an empty declaration | Service layer line count check |
| Employer can only access own data | Service layer ownership check |
| Suspended employer cannot create declarations | Service layer status check |
| Employee must belong to the declaring employer | Service layer FK check |
| Deleted user's JWT rejected immediately | JWT strategy checks `status === 'active'` |
| Pension is always applied, no opt-out | No `enrolledPension` flag; always calculated |
| Contribution line enrollment flags are immutable | Set at creation; never updated in place |

## Authentication

JWT-based via `passport-jwt`.

**Token payload:**
```json
{
  "sub": "<userId>",
  "email": "...",
  "role": "employer|admin",
  "employerId": "<uuid>|null"
}
```

**How it works:**
- `JwtAuthGuard` validates the token and attaches `req.user`
- `RolesGuard` + `@Roles(...)` enforces role requirements at the handler level
- `JwtStrategy.validate()` checks `user.status === 'active'` on every request, deleted accounts are locked out without waiting for token expiry
- Service methods perform an additional ownership check to scope employer users to their own data

**Rate limits:**
- Login: 10 requests/minute
- Register admin: 5 requests/minute
- All other endpoints: 60 requests/minute (global `ThrottlerGuard`)

## Audit Log Entry Structure

Every mutating request produces one row in `audit_logs`:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "userEmail": "admin@rssb.rw",
  "userRole": "admin",
  "action": "DECLARATION_VALIDATE",
  "targetType": "Declaration",
  "targetId": "uuid",
  "before": {
    "id": "uuid",
    "status": "submitted",
    "period": "2025-01",
    "grand_total": "69000.00"
  },
  "after": {
    "id": "uuid",
    "status": "validated",
    "period": "2025-01",
    "grand_total": "69000.00",
    "validated_at": "2025-03-09T10:00:00Z"
  },
  "ipAddress": "192.168.1.1",
  "createdAt": "2025-03-09T10:00:00Z"
}
```

- `before` is `null` for creates (no prior row exists)
- `after` is `null` for deletes (handler returns 204 with no body)
- Passwords are stripped recursively from both snapshots

## Assumptions

1. **One user account per employer.** The system links a single login to each employer record. Adding multiple users per employer (e.g. HR + Finance roles) would require an `employer_users` join table and is not in scope.

2. **Gross salary can be overridden per declaration period.** When building declaration lines, callers can pass a `grossSalary` that overrides the employee's base salary for that period. This handles bonus months and mid-period salary changes without updating the employee record.

3. **Payment number is for reference only.** It is auto-generated, guaranteed unique, and intended to match bank transfers to declarations. It is not validated against any external payment gateway.

4. **Period validation is format-only.** The system validates `YYYY-MM` but does not block future or very old periods. A production constraint like "no declarations more than 3 months in arrears" would be a one-line addition to the service.

5. **TIN is always 9 digits.** Based on Rwanda Revenue Authority format. Relax the regex in `employer.dto.ts` for multi-country deployment.

6. **Rejection is terminal.** A rejected declaration cannot be re-submitted. The employer creates a new declaration for the same period. This is the simpler model; a `REJECTED -> DRAFT` re-open transition could be added if needed.

7. **Rates represent the employer's contribution only.** The 6% / 7.5% / 0.3% figures are the employer-side share. Employee-side deductions are out of scope.

8. **Soft-deleted national IDs stay reserved.** Re-registering an employee after soft-deletion is not supported via a new record. The existing row must be reactivated manually (status reset to `active`). This prevents accidental duplicate identities for the same person.

9. **Audit logs are append-only.** There is no delete or update endpoint for `audit_logs`. Cleanup, if ever needed, is a direct DB operation with appropriate access controls outside the API.

## What Could Be Added Next

### Security
- **Refresh tokens.** Current JWTs are single-token with no rotation. A `refresh_tokens` table with short-lived access tokens and longer-lived refresh tokens would harden session management.
- **Idempotency keys.** Declaration submission should accept an `Idempotency-Key` header to safely retry on network failure without creating duplicates.

### Performance
- **Redis caching** on the contribution summary endpoint. Validated declarations do not change, so the monthly aggregation is a good candidate for a short TTL cache.
- **Background job queue** (Bull/BullMQ) for large declarations with hundreds of employees, rather than blocking the HTTP request for the full computation.

### Features
- **Bulk employee import.** CSV upload to onboard many employees at once, which is the typical case for a new employer joining the system.
- **Email notifications.** Alert the employer when their declaration is validated or rejected.
- **Payment gateway webhook.** Expose a webhook endpoint to receive payment confirmation and mark a validated declaration as paid.
- **Declaration amendments.** Allow correcting a validated declaration by creating an amendment that references the original, preserving the full audit trail.
- **Export endpoints.** Download a declaration as a PDF or CSV for physical record-keeping.

### Developer Experience
- **Unit tests for calculation logic.** The e2e suite covers the happy path end-to-end, but isolated unit tests for `ContributionLine.calculate()`, the enrollment resolution logic, and the `deriveAction()` audit helper would be faster to run and easier to pin regressions to.
- **OpenAPI client generation.** The Swagger spec is already complete. Auto-generating a TypeScript client SDK from it would make integration straightforward for frontend consumers.