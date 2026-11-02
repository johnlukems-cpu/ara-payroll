# ARA Payroll — Architecture

## Layout

```
prisma/                 schema, migrations, seed
src/lib/payroll/engine.ts   pure calculation engine (no I/O) — reusable by other ARA products
src/lib/payroll/service.ts  loads data, runs the engine, persists payslips in one transaction
src/lib/server/         auth/session, RBAC guards, audit, storage, PDF, CSV, reports
src/lib/permissions.ts  role → permission matrix (single source of truth)
src/app/actions/        server actions (all mutations; Zod-validated, permission-checked, audited)
src/app/app/            staff application
src/app/me/             employee self-service
src/app/api/            file downloads/exports (PDF, CSV, documents) and /api/health
tests/                  unit, integration, e2e
```

## Data model highlights

- **Organization → Company → Membership(User, role)**: an organisation (business or accounting firm) owns companies; users get a role per company.
- **Money is integer cents (SRD); rates are basis points** — no floating-point currency.
- **Contract** rows are append-only salary history; the latest contract effective in a period is used.
- **TaxRuleSet** is versioned by `effectiveFrom`; company sets override platform defaults (`companyId = null`). Sets used by approved payroll cannot be edited.
- **Payslip** snapshots employee name, bank and department at calculation time and stores every line plus a calculation `trace` for auditability.
- **PayrollRun** status machine: `DRAFT → CALCULATED → APPROVED → PAID`. Approved and paid runs are locked; approved runs can be reopened, paid runs cannot.

## Calculation (per employee, per month)

1. Base pay: monthly salary × employed fraction − unpaid days (salary ÷ 21.75 per day), or hours × hourly rate.
2. Overtime: hourly equivalent (salary ÷ (hours/week × 52/12)) × hours × 150% / 200% (company-configurable). Taxed separately under the overtime brackets.
3. Allowances: taxable part / exempt part per component treatment. Child allowance exempt up to per-child limit × min(children, max).
4. Pre-tax deductions: employee pension and components flagged pre-tax.
5. Wage tax: regular taxable wage − forfaitaire aftrek (rate, capped) → ×12 → bracket table → ÷12 − heffingskorting (floored at 0).
6. Special reward: exempt up to the remaining annual exemption (tracked from earlier runs in the year); the excess is taxed at the marginal rate (tax(annual + bonus) − tax(annual)).
7. AOV: rate × (base + taxable allowances + overtime + bonus − monthly franchise).
8. Net = gross − all taxes − AOV − pension − other deductions. Employer cost = gross + employer pension.

All parameters live in the tax rule set — none are hard-coded in the engine.

## Security

- Sessions: random 256-bit token in an `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookie; only its SHA-256 hash is stored. 12-hour expiry; password change revokes other sessions.
- Passwords: bcrypt (cost 12), minimum policy enforced; login rate-limited per email and IP; constant-time path for unknown users.
- Authorisation: every server action and route handler calls `requirePermission`; every query is scoped by the active company id. `proxy.ts` is only an optimistic redirect.
- Server actions get Next.js' built-in origin checking (CSRF protection).
- Uploads: MIME allow-list, 8 MB limit, stored outside the web root with random keys, served only through an authorised handler with `Content-Disposition: attachment`.
- CSV exports neutralise spreadsheet formula injection.
- Audit log for logins, employee/contract changes, payroll lifecycle, settings, exports and downloads.
- Security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).

## Production notes / next steps

- The login rate limiter is in-memory; use Redis for multi-instance deployments.
- Implement an S3-compatible `StorageDriver` (interface in `src/lib/server/storage.ts`) for cloud object storage.
- Add email delivery (invitations, payslip notifications, password reset) — temporary passwords are currently shown once to the administrator.
- Bank file is a generic CSV; add bank-specific formats (DSB, Hakrinbank, Finabank, Republic Bank) once their import specifications are confirmed.
- Movable public holidays (Holi Phagwa, Eid ul-Fitr, Diwali, Easter, Chinese New Year) are not in the working-day calendar yet.
- Dutch-language UI (i18n) is a natural next step for the Surinamese market.
