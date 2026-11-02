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

## Internationalisation

- `next-intl` without locale routing. The locale is resolved per request in `src/i18n/request.ts`: the signed-in user's `User.locale` → `ARA_LOCALE` cookie → Dutch (default).
- `messages/nl.json` and `messages/en.json` hold every interface string, including validation and error messages (server actions throw `UserError("errors.key")`; Zod schemas use `validation.*` keys as messages; `handleError` translates both).
- Formatting (`createFormat(locale)` in `src/lib/format.ts`) is locale-dependent but currency-independent; currencies are always shown by ISO code. Input parsing accepts both `1.234,56` and `1,234.56`.
- Statutory payslip lines are stored with codes and labelled at display time, so the same payslip renders in either language (screen and PDF). Company-defined names (components, leave types, departments) are data and are seeded in the creator's language.
- `tests/unit/i18n.test.ts` fails the build when the catalogues diverge, placeholders differ, or code uses a missing key.

## Multicurrency

- `Currency` (ISO 4217 register, activated by the platform administrator), `ExchangeRate` (1 base = rate quote, dated, source MANUAL/API, status PENDING/APPROVED/REJECTED, company or platform scope; never overwritten) and `PlatformSetting` (rate provider).
- Company: `currency` (base/reporting currency), `rateRequireApproval`, `rateAllowApi`. Contract: `salaryCurrency`. Employee: `paymentCurrency`. Fixed components and adjustments: explicit `currency`.
- `RateBook` (`src/lib/server/rates.ts`) resolves every currency pair needed for a run up front (company rate before platform rate, direct before inverse, latest effective ≤ period end; API rates only when allowed) and records each conversion. Conversion uses exact BigInt arithmetic (`src/lib/currency.ts`).
- Payslip stores amounts in the calculation currency plus `netPayPayment` (payment currency), `*Base` amounts (base currency) and the `conversions` audit trail. Run totals are base-currency sums; reports never add different currencies together.
- Migrations backfill existing data as SRD and pin the currency of existing components so later salary-currency changes cannot reinterpret them.

## Payroll components, tax rules and declarations

- `src/lib/payroll/library.ts` — central component library (also inserted into `ComponentLibrary` by migration). System entries map to engine line codes (`LINE_TO_LIBRARY`), so every payslip line traces to a library code.
- `src/lib/payroll/formula.ts` — safe arithmetic evaluator (tokenizer + recursive descent; no `eval`).
- `src/lib/payroll/engine.ts` — `resolveComponentAmounts` evaluates components in dependency order (cycles rejected); gross/net/employer treatment follows the component kind, so custom components cannot bypass the tax configuration. Employer contributions never reduce net pay.
- Tax rule sets (`TaxRuleSet`) carry regime, effective/verified-until dates, tax-free amounts (annual and monthly stored separately), deduction mode, calculation method and citations. AOV has its own `AovRuleSet` (rate, base, franchise, min/max, employee share, age exemption).
- Legal validation: a payslip is `VALIDATED` only if the tax and AOV rules are `VERIFIED` and valid for the period, and no pending-status component contributed. Approval of pending payroll or declarations requires an explicit acknowledgement that is stored and audited.
- Declarations (`Declaration`, `DeclarationFile`, `DeclarationEvent`): drafts are created when payroll is approved; the snapshot is immutable after approval; files are stored in the database (serverless-safe); the status machine (`src/lib/declarations/status.ts`) never moves to SUBMITTED/ACCEPTED automatically. Reopening payroll is blocked once its declaration is approved — corrections use supplementary declarations.
- Fixed components (`EmployeePayComponent`) carry per-employee overrides (label, method, base component, tax treatment, AOV/pension flags), `frequency`, `payMonth`, validity and `isActive`. `src/lib/payroll/schedule.ts` decides per period: pay / accrue / accrue-and-pay / skip. Accrual balances are stored per assignment in the payslip trace (`trace.accruals`) and carried forward from the latest earlier payslip; payout adds the balance as a separate line and resets it.
- Incidental components (`PayrollAdjustment`) belong to one run; a row with `assignmentId` replaces the amount of a fixed component for that run only (never adds to it). `src/lib/server/pay-components.ts` builds the dropdowns (company components with `availableToAll` + not-yet-used library entries, adopted on first use), blocks statutory codes, and rejects duplicates (overlapping fixed assignment with the same label; incidental entry of a component that already applies as fixed unless `allowDuplicate` is confirmed; the same incidental entry twice; a fixed pension amount when the contract has a pension %).
- Every payslip line stores its `source` (BASE, FIXED, INCIDENTAL, STATUTORY, LEAVE); `src/lib/payroll/summary.ts` derives the 12 summary totals (older payslips are classified by line code). Approved/paid runs are never recalculated, so historical payslips stay unchanged.
- Leave: `LeaveType` holds category, statutory and company entitlement, paid share and legal status; approved leave becomes engine input (`leaveInputsForPeriod`) and appears as a separate payslip line.

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
- Documents use the S3-compatible driver when `S3_BUCKET` is set (required on Vercel), otherwise local disk.
- Add email delivery (invitations, payslip notifications, password reset) — temporary passwords are currently shown once to the administrator.
- Bank file is a generic CSV; add bank-specific formats (DSB, Hakrinbank, Finabank, Republic Bank) once their import specifications are confirmed.
- Movable public holidays (Holi Phagwa, Eid ul-Fitr, Diwali, Easter, Chinese New Year) are not in the working-day calendar yet.
- Email delivery (and translated email templates) is not implemented yet.
- The external rate provider is generic (JSON with `rates`/`conversion_rates`); add a dedicated Centrale Bank van Suriname integration if an official feed becomes available.
