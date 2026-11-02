# ARA Payroll

**Cloud-based payroll management for Suriname**
*Developed by ARA Intelligent Solutions — part of the ARA software ecosystem (ARA Payroll · ARA Accounting · ARA Tax · ARA HR).*

ARA Payroll lets Surinamese employers and accounting firms run complete monthly payroll in the cloud: employee administration, contracts and salary history, allowances and deductions, Loonbelasting / AOV calculation, payslips, leave, reports, bank payment files and employee self-service.

## Features

| Area | What it does |
| --- | --- |
| **Employees** | Personnel records (ID number, district, bank, children), departments, documents, CSV export |
| **Contracts & salary** | Versioned contracts (permanent, fixed-term, temporary, probation), monthly or hourly pay, pension % (employee/employer), full salary history |
| **Allowances & deductions** | Configurable components: fixed or % of base, taxable / tax-free / tax-free up to a limit / statutory child allowance, pre-tax deductions |
| **Payroll engine** | Loonbelasting (annualised brackets, forfaitaire aftrek, heffingskorting), separate overtime tax, special-reward (bijzondere beloning) exemption tracked across the year, AOV with franchise, proration for mid-month hires/terminations, unpaid days |
| **Payroll workflow** | Draft → Calculated → Approved (locked) → Paid; period inputs grid, one-off adjustments, recalculation, reopen |
| **Payslips** | On-screen, printable and PDF (single or the whole run) |
| **Leave** | Leave types and entitlements, requests and approvals, balances, working-day calculation that skips weekends and fixed Surinamese public holidays |
| **Reports** | Monthly wage tax & AOV remittance summary, annual statements per employee, department cost, payroll journal CSV, bank payment CSV |
| **Self-service** | Employees view their payslips, download PDFs, request leave, see balances, change password |
| **Multi-company** | One login for several employers (groups, accounting firms), company switcher, per-company roles |
| **Security** | Role-based access (Owner, Admin, Payroll manager, HR manager, Accountant read-only, Employee), hashed DB sessions, rate-limited login, audit log, tenant-scoped queries, security headers |

## ⚠️ Statutory rates must be verified

Suriname's tax legislation changes regularly. ARA Payroll ships a **platform default tax rule set marked "not verified"** (`src/lib/payroll/defaults.ts`). Before running production payroll, an administrator must review every value under **Settings → Tax rules**, create a company version with the correct rates and effective date, and mark it verified. Approved payroll keeps the rule-set version it was calculated with.

## Tech stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 with shadcn-style components · PostgreSQL 16 · Prisma 6 · Zod 4 · Recharts · pdf-lib · Vitest · Playwright · Docker.

## Getting started (local)

Requirements: Node 22+, PostgreSQL 16.

```bash
cp .env.example .env          # set DATABASE_URL
npm install
npx prisma migrate deploy
npm run db:demo               # platform defaults + demo company (or `npm run db:seed` for defaults only)
npm run dev
```

Open http://localhost:3000. Demo logins (password `Demo12345!`): `owner@demo.ara.sr`, `payroll@demo.ara.sr`, `accountant@demo.ara.sr`, `employee@demo.ara.sr`.

## Tests

```bash
npm test                  # unit tests — payroll engine, leave calendar
npm run test:integration  # payroll service against PostgreSQL
npm run build && npm run test:e2e   # Playwright end-to-end (needs demo data)
npm run lint && npm run typecheck
```

## Deployment

```bash
POSTGRES_PASSWORD=<strong-password> docker compose up -d --build
```

The `migrate` service applies migrations and ensures the default tax rule set before the app starts. Uploaded documents are stored in the `storage` volume. Serve behind TLS (session cookies are `Secure` in production). Health check: `GET /api/health`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architecture, calculation rules and production notes.
