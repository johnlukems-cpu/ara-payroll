# ARA Payroll

**Cloud-based payroll management for Suriname**
*Developed by ARA Intelligent Solutions — part of the ARA software ecosystem (ARA Payroll · ARA Accounting · ARA Tax · ARA HR).*

ARA Payroll lets Surinamese employers and accounting firms run complete monthly payroll in the cloud — in **Dutch or English** and in **multiple currencies**: employee administration, contracts and salary history, allowances and deductions, Loonbelasting / AOV calculation, payslips, leave, reports, bank payment files and employee self-service.

## Features

| Area | What it does |
| --- | --- |
| **Employees** | Personnel records (ID number, district, bank, children), departments, documents, CSV export |
| **Contracts & salary** | Versioned contracts (permanent, fixed-term, temporary, probation), monthly or hourly pay, pension % (employee/employer), full salary history |
| **Allowances & deductions** | Per-employee fixed allowances and deductions (tab *Toelagen en inhoudingen*) with own name, amount, currency, method (fixed, % of base, % of another component, variable), frequency (monthly, per period, one-off, annual, accrual with annual payout — e.g. holiday allowance), validity dates, tax treatment (taxable / exempt / per statutory configuration — never exempt automatically), AOV/pension base flags, active flag and note. Extra (incidental) allowances and deductions per payslip via dropdowns, for one or many employees; statutory deductions are automatic and cannot be entered twice; fixed amounts can be adjusted for a single payslip; duplicate entries are rejected. Components marked "available to all employees" appear in the dropdowns automatically; bulk assignment from the component page |
| **Payroll engine** | Loonbelasting (annualised brackets, forfaitaire aftrek, heffingskorting), separate overtime tax, special-reward (bijzondere beloning) exemption tracked across the year, AOV with franchise, proration for mid-month hires/terminations, unpaid days |
| **Payroll workflow** | Draft → Calculated → Approved (locked) → Paid; period inputs grid, one-off adjustments, recalculation, reopen |
| **Employee & employer contributions** | Health insurance, pension and FVO schemes with separate employee contribution (deduction) and employer contribution (employer cost, never deducted from net pay): percentage or fixed amount, calculation base (base salary, pension base, regular wage, gross wage), optional maximum base, currency, validity with versioning, active flag, statutory vs. employment-condition basis with legal status, tax treatment of the employee share, payslip display of the employer share; per-employee participation, opt-out and individual rates. No rates are prefilled. Double deductions with existing components or contract pension percentages are prevented |
| **Payslips** | Compose page per employee (salary data, fixed allowances/deductions, extra dropdowns, calculation, preview, finalise); on-screen, printable and PDF with the 12-line summary (base salary, fixed/incidental allowances, gross, taxable base, wage tax, AOV, other/total deductions, net salary, tax-free reimbursements, total payable); net pay is recalculated automatically after every change |
| **Leave** | Leave types and entitlements, requests and approvals, balances, working-day calculation that skips weekends and fixed Surinamese public holidays |
| **Reports** | Monthly wage tax & AOV remittance summary, annual statements per employee, department cost, payroll journal CSV, bank payment CSV |
| **Self-service** | Employees view their payslips, download PDFs, request leave, see balances, change password |
| **Bilingual (NL / EN)** | Complete Dutch and English interface, payslips, PDFs, CSV exports and validation messages. Dutch is the default; the choice is saved per user (all devices) and in a cookie for visitors. Locale-aware dates and numbers (nl-SR / en-GB), independent of currency |
| **Multicurrency** | ISO 4217 currency register (SRD, USD, EUR, GYD, TTD, GBP, CAD, XCD), company base currency with a controlled change process, per-employee salary currency and payment currency, currency per allowance/deduction/adjustment, exchange-rate management (manual, approval workflow, external provider, full history), every conversion recorded on the payslip |
| **Pay component library** | 65 standard components in 7 categories (salary, allowances, overtime, bonuses, deductions, employer contributions, leave) with Dutch/English names, plus company-specific custom components. Eight calculation methods (fixed, % of base, % of component, hours × rate, days × rate, quantity × price, safe formulas, manual), per-component tax, AOV and pension treatment, GL account, validity dates, legal reference and approval status |
| **Tax & Declarations** | Versioned tax rules (S.B. 2024 no. 2 art. 12/13/14; separate art. 17a regime), separate AOV rules, legal sources register, legal-validation gating, transparent calculation breakdown per payslip, automatic declaration drafts after payroll approval, review/approval workflow, PDF/Excel/CSV files, manual submission recording with receipts, supplementary declarations, full history |
| **Parental leave** | Maternity, paternity, adoption and parental leave with statutory vs. company entitlements, part-time leave, child-linked balances, documents, HR approval with payment status and automatic payroll integration as separate line items |
| **Website & pricing** | Public homepage with pricing section driven by the plans in the database (managed in the ARA admin portal; `src/lib/pricing.ts` is only the fallback), plan buttons to registration, demo and quote request form (`/contact`, stored in `ContactRequest`, rate-limited, honeypot). Registration creates a request that ARA approves (default) or, if configured, an instant account with a trial |
| **ARA admin portal (`/admin`)** | Separate portal for ARA Intelligent Solutions staff (super administrator / SaaS administrator): dashboard with real figures (customers, subscriptions by status, open invoices, payments, MRR/ARR per currency, customers per plan), customer management (search, filter, sort, detail page with companies, users, subscription, invoices, payments, history and activity), new requests (approve → account, company and trial; reject; request information; schedule demo; convert to customer), configurable plans (price changes only apply to new subscriptions; agreed terms are stored per subscription), subscription actions (assign, upgrade/downgrade, renew, suspend/resume, cancel, extend/convert trial, extra capacity, discount, customer price), trials with reminders, invoicing (sequential numbers per series, credit notes, PDF, outstanding amounts) with **manual** payment registration (no payment provider), users and platform roles, controlled support access, reports, settings and a platform audit log |
| **Subscription access** | Each customer's access follows its subscription: warnings in the last trial days, on arrears and before a cancellation takes effect; blocked (with a contact page) after trial end, suspension, expiry or cancellation. Employee limits per plan are enforced. Customers created before subscriptions existed keep full access |
| **Support access** | Super administrators can open a customer environment only with a stated reason, for at most 8 hours, read-only, logged in both the platform and the customer's audit log, with a visible banner. There is no impersonation of customer users |
| **Multi-company** | One login for several employers (groups, accounting firms), company switcher, per-company roles |
| **Security** | Role-based access (Owner, Admin, Payroll manager, HR manager, Accountant read-only, Employee), hashed DB sessions, rate-limited login, audit log, tenant-scoped queries, security headers |

## Multicurrency in short

- Statutory amounts (loonbelasting, AOV) are calculated in the tax rule set's currency (SRD). Salary, allowances, deductions and bonuses in other currencies are converted into it first.
- Net pay is converted into the employee's **payment currency**; run totals and reports use the company **base currency**.
- Only **approved** rates effective on the last day of the period are used; payroll refuses to calculate when a rate is missing — it never guesses.
- Each payslip stores every conversion: original amount and currency, rate, rate date, source and converted amount.
- Historical payroll keeps its original currency and rates; changing the base currency requires confirmation, a reason, no open runs, and is audited.

## ⚠️ Statutory rules must be verified

See **[docs/LEGAL_RESEARCH.md](docs/LEGAL_RESEARCH.md)** for the researched rules, their sources, open conflicts and the activation checklist.



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

Open http://localhost:3000. Demo logins (password `Demo12345!`): `owner@demo.ara.sr` (also platform administrator), `payroll@demo.ara.sr`, `accountant@demo.ara.sr` (English UI), `employee@demo.ara.sr`. The demo includes a USD-salaried employee paid in USD and a EUR-salaried employee paid in SRD.

Useful scripts:

```bash
npm run admin:grant -- you@example.com   # make a user platform administrator (currencies, rate provider)
npm run payroll:recalc                   # recalculate all open (draft/calculated) payroll runs
```

## Tests

```bash
npm test                  # unit tests — payroll engine, currency maths, formatting, translation completeness
npm run test:integration  # payroll service, contributions, declarations and the SaaS lifecycle against PostgreSQL
npm run build && npm run test:e2e   # Playwright end-to-end incl. admin-portal acceptance tests 1–14 and tenant isolation (needs demo data)
npm run lint && npm run typecheck
```

## Deployment

```bash
POSTGRES_PASSWORD=<strong-password> docker compose up -d --build
```

The `migrate` service applies migrations and ensures the default tax rule set before the app starts. Uploaded documents are stored in the `storage` volume. Serve behind TLS (session cookies are `Secure` in production). Health check: `GET /api/health`.

### Vercel

1. **Database** — create a PostgreSQL database (Vercel Marketplace → Neon, or Supabase). Copy its connection string.
2. **Document storage** — create an S3-compatible bucket (Cloudflare R2, AWS S3 or Supabase Storage) with an access key. Vercel's filesystem is not persistent, so uploads need this.
3. **Import** the GitHub repository in Vercel (*Add New → Project*). Framework preset: Next.js. Vercel automatically runs `npm run vercel-build`, which applies migrations, ensures the default tax rule set and builds the app.
4. **Environment variables** (Project → Settings → Environment Variables): `DATABASE_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` (R2/Supabase only), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. Optional: `CRON_SECRET` enables the daily subscription job (`vercel.json` → `/api/cron/subscriptions`: trial reminders, expired trials, arrears); without it the same processing runs whenever an administrator opens the portal dashboard. See `.env.example`.
5. Deploy, then register your first account at `/register`. (Optional demo data: run `npm run db:demo` locally with `DATABASE_URL` pointing at the production database — not recommended for a live system.)

Note: the login rate limiter is in-memory, i.e. per serverless instance; add Redis/Upstash for strict limits.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architecture, calculation rules and production notes.
