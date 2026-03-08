# Employer Contribution Management API

A production-grade backend for an Employer Contribution Management System. Built with NestJS, TypeORM, and PostgreSQL.

## Quick Start

**With Docker (recommended):**

```bash
git clone git remote add origin https://github.com/degide/Contribution-Management.git
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
Edit `.env` with your DB credentials. The defaults match the Docker Compose setup.

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

Use the seed credentials to log in:
| Role | Email | Password |
|------|-------|----------|
| admin | `admin@rssb.rw` | `Admin1234!` |
| employer | `employer@kigalitea.rw` | `Employer1234!` |
| employer | `employer@rwconstruct.rw` | `Employer2nd!` |

### 6. Tests
```bash
npm run test         # unit tests
npm run test:e2e     # end-to-end tests (requires running DB and .env configured)
npm run test:cov     # coverage report
```

## API Overview

All endpoints are prefixed with `/api/[version]`. JWT Bearer token required on all endpoints except `/auth/*`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login -> returns JWT |
| POST | `/auth/register` | Create user account |

### Employers
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/employers` | admin | Create employer |
| GET | `/employers` | any | List (scoped by role) |
| GET | `/employers/:id` | any | Get employer |
| PATCH | `/employers/:id` | any | Update |
| DELETE | `/employers/:id` | admin | Delete |
| PATCH | `/employers/:id/suspend` | admin | Suspend employer |

### Employees
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/employees` | any | Register employee |
| GET | `/employees` | any | List (scoped by role) |
| GET | `/employees/:id` | any | Get employee |
| PATCH | `/employees/:id` | any | Update |
| DELETE | `/employees/:id` | any | Remove |

### Declarations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/declarations` | any | Create draft declaration |
| GET | `/declarations` | any | List (scoped by role) |
| GET | `/declarations/:id` | any | Get declaration with lines |
| PATCH | `/declarations/:id/lines` | employer | Update lines (draft only) |
| PATCH | `/declarations/:id/submit` | employer | Submit draft |
| PATCH | `/declarations/:id/validate` | admin | Validate submitted |
| PATCH | `/declarations/:id/reject` | admin | Reject with reason |

### Contribution Summary
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/employers/:id/contribution-summary` | any | Monthly summary with optional `?from=YYYY-MM&to=YYYY-MM` |

All list endpoints support pagination: `?limit=10&offset=0`

## Architecture Decisions

### 1. Module-per-Domain Structure
Each domain (auth, employers, employees, declarations) is a self-contained NestJS module with its own controller, service, DTOs, and entities. This mirrors real-world DDD (Domain-Driven Design) and makes the codebase easy to navigate and test in isolation.

### 2. Transaction-Backed Declaration Creation
Creating a declaration involves inserting the declaration record, all contribution lines, and updating cached totals using three separate writes. These are wrapped in a TypeORM `DataSource.transaction()` to ensure atomicity: either all succeed or none do. This prevents orphaned declarations without lines.

### 3. Cached Totals on Declaration
Rather than summing contribution lines at query time (which is costly for large declarations), the `declarations` table stores pre-computed `total_pension`, `total_medical`, `total_maternity`, and `grand_total`. These are recalculated whenever lines change or are replaced. This trades a small amount of write complexity for much faster read performance on the summary endpoint.

### 4. Status-as-State-Machine
The declaration follows a strict state machine:
```
DRAFT -> SUBMITTED -> VALIDATED -> REJECTED
```
Transitions are enforced in the service layer (not just the DB). An employer can only submit from DRAFT, an admin can only validate/reject from SUBMITTED. Once submitted or validated, lines cannot be edited.

### 5. Decimal Precision
All monetary values use `DECIMAL(15,2)` (not `FLOAT`) to avoid floating-point rounding errors that are critical in financial systems. JavaScript arithmetic on these values is rounded to 2 decimal places using `Math.round(x * 100) / 100` before persistence.

### 6. UUID Primary Keys
UUIDs (v4) are used for all primary keys instead of auto-incrementing integers. This avoids exposing internal record counts, makes IDs safe to share in URLs, and simplifies future data migrations or multi-tenant setups.

### 7. Role-Based Data Scoping in Service Layer
Authorization is enforced in the service layer (not just guards), so that even if a controller guard is misconfigured, an employer cannot access another employer's employees or declarations. Every "sensitive" service method performs an explicit ownership check after fetching the resource.

### 8. Separate ContributionSummaryController
The summary endpoint lives at `/employers/:id/contribution-summary`, which makes it semantically clear it's a per-employer report. To avoid cluttering `EmployersController` with declaration logic, it's implemented in a second controller exported by `DeclarationsModule`. NestJS supports multiple controllers per module cleanly.

## Database Design & Indexes

### Why These Indexes?

```sql
-- Employer TIN must be globally unique
CREATE UNIQUE INDEX "UQ_employers_tin" ON employers (tin);

-- National ID uniquely identifies a person across all employers
CREATE UNIQUE INDEX "UQ_employees_national_id" ON employees (national_id);

-- Most employee queries filter by employer to avoids sequential scans
CREATE INDEX "IDX_employees_employer_id" ON employees (employer_id);

-- Core business rule: one declaration per employer per period
CREATE UNIQUE INDEX "UQ_declaration_employer_period" ON declarations (employer_id, period);

-- Summary queries filter and sort by (employer_id, period) index
CREATE INDEX "IDX_declarations_employer_period" ON declarations (employer_id, period);

-- Admin dashboard often filters by status
CREATE INDEX "IDX_declarations_status" ON declarations (status);

-- Line lookups always start with declaration_id
CREATE INDEX "IDX_contribution_lines_declaration" ON contribution_lines (declaration_id);

-- Prevents an employee appearing twice in the same declaration
CREATE UNIQUE INDEX "UQ_contribution_line_declaration_employee" ON contribution_lines (declaration_id, employee_id);
```

**EXPLAIN analysis (conceptual):**
- The composite index on `(employer_id, period)` means the contribution summary query is an **Index Scan** rather than a **Seq Scan**: critical when an employer has hundreds of declarations.
- The unique constraint on `(declaration_id, employee_id)` enforces duplicate-employee prevention at the DB level as a safety net, even if the service layer check is bypassed.

## Business Rules Enforced

| Rule | Enforcement Level |
|------|------------------|
| Unique TIN per employer | DB unique index + service check |
| Unique national ID per employee | DB unique index + service check |
| One declaration per employer per period | DB composite unique index + service check |
| Unique payment number | DB unique index + `@BeforeInsert` generator |
| Draft-only edits | Service layer state check |
| Cannot submit empty declaration | Service layer count check |
| Employer can only access own data | Service layer ownership check |
| Suspended employer cannot create declarations | Service layer status check |
| Employee must belong to declaring employer | Service layer foreign key check |

## Authentication & Authorization

JWT-based auth using Passport.js `passport-jwt` strategy.

**Token payload:**
```json
{ 
  "sub": "<userId>", 
  "email": "...", 
  "role": "employer|admin", 
  "employerId": "<uuid>|null" 
}
```

**Role enforcement:**
- `JwtAuthGuard`: validates token and attaches `request.user`
- `RolesGuard` + `@Roles(...)`: checks role on handler/class
- Service-layer scoping: employer users are silently filtered to their own data

**Rate limiting:**
- Auth endpoints: stricter limits (5 registrations/min, 10 logins/min)
- All other endpoints: 60 requests/min via global `ThrottlerGuard`

## Contribution Calculation

```
Pension   = gross_salary × 6.0%
Medical   = gross_salary × 7.5%
Maternity = gross_salary × 0.3%
─────────────────────────────────
Total     = gross_salary × 13.8%
```

**Example salary of 500,000 RWF:**
| Type | Rate | Amount (RWF) |
|------|------|-------------|
| Pension | 6% | 30,000 |
| Medical Insurance | 7.5% | 37,500 |
| Maternity Leave | 0.3% | 1,500 |
| **Total** | **13.8%** | **69,000** |

Rates are defined as constants in `contribution-line.entity.ts` (`CONTRIBUTION_RATES`) to make future rate changes a single-file edit.

## Assumptions Made

1. **One user per employer**: The system links one user account to each employer. Multi-user employer accounts (e.g. HR + Finance roles) are not in scope but could be added with an `employer_users` join table.

2. **Gross salary override per period**: When creating declaration lines, callers can pass a `grossSalary` that overrides the employee's base salary for that period. This models real-world scenarios where salary changes mid-year or a bonus month occurs.

3. **Payment number is for reference only**: It's auto-generated and guaranteed unique, but it is not validated against any external payment gateway. The assumption is this number is used to match bank transfers to declarations.

4. **Period validation is format-only**: The system validates `YYYY-MM` format but does not prevent creating a declaration for a future or distant past period. In production, you'd add a business rule like "cannot declare for periods more than 3 months in the past".

5. **TIN is always 9 digits**: Based on Rwanda Revenue Authority format. This validation can be relaxed for multi-country deployments.

6. **Rejection means re-declaration**: A rejected declaration cannot be re-submitted. The employer must create a new declaration for the same period. This is the simpler model; an alternative would be allowing a rejected -> draft transition.

7. **Contribution rates are employer-side only**: The rates (6%, 7.5%, 0.3%) represent only the employer's contribution.

## What I'd Improve with More Time

### Security & Reliability
- **Refresh tokens**: Current JWTs are long-lived (without refresh). Add refresh token rotation with a `refresh_tokens` table for better security.
- **Audit log table**: Every status transition and sensitive mutation should write to an `audit_logs` table with `who`, `what`, `before`, `after`, and `timestamp`. Critical for a government-grade financial system.
- **Idempotency keys**: Declaration submission should accept an idempotency key header to prevent double-submits from network retries.

### Performance
- **Redis caching**: The contribution summary endpoint is a good candidate for short-lived cache (e.g., 5-minute TTL) since validated declarations don't change.
- **Background jobs**: Large declaration processing (>1000 employees) should be queued via Bull/BullMQ rather than blocking the HTTP request.
- **Database connection pooling**: Tune TypeORM pool settings (`max`, `min`, `acquireTimeoutMillis`) based on load testing results.

### Features
- **Bulk employee import**: CSV upload to register many employees at once (common need for employers onboarding).
- **Notification emails**: Send email when a declaration is validated or rejected.
- **Payment integration**: Generate a payment reference and expose a webhook endpoint for payment gateways to confirm remittance.
- **Multi-period amendment**: Allow correcting a validated declaration by creating an amendment with a reference to the original.
- **Export endpoints**: Download declarations as PDF or CSV for record-keeping.

### Developer Experience
- **OpenAPI client generation**: Use `@nestjs/swagger`'s CLI plugin for zero-boilerplate Swagger decorators, then auto-generate a TypeScript client SDK.
- **More unit tests**: Current test suite is e2e. Unit tests for `DeclarationsService.buildContributionLines` and calculation logic would be faster and more targeted.
- **Docker multi-stage with distroless**: Reduce final image size significantly by using `gcr.io/distroless/nodejs` instead of `node:22-alpine`.
