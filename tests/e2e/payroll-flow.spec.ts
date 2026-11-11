import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resetDefaultSchemes } from "../helpers/schemes";

const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

/** Scenario tests below configure contribution schemes themselves: start from untouched default schemes. */
async function resetSchemesOf(email: string) {
  const m = await db.membership.findFirstOrThrow({ where: { user: { email } } });
  await resetDefaultSchemes(db, m.companyId);
}

/** Records the explicit decision that the statutory health insurance, pension and FVO schemes do not apply (test companies). */
async function markStatutoryNotApplicable(page: Page, en = false) {
  for (const type of ["HEALTH", "PENSION", "FVO"]) {
    await page.goto("/app/settings/contributions");
    await page.getByTestId(`validation-${type}`).getByRole("link").click();
    await page.getByText(en ? "Mark as not applicable" : "Markeren als niet van toepassing").click();
    await page.fill("input[name=reason]", "E2E-test: werkgever valt niet onder deze regeling");
    await page.getByRole("button", { name: en ? "Not applicable" : "Niet van toepassing", exact: true }).click();
    await expect(page.getByText(en ? /is marked as not applicable/ : /is gemarkeerd als niet van toepassing/)).toBeVisible();
  }
}

/** Signs in on the given page. */
async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(app|admin|me)/);
}

/**
 * Registrations need approval by ARA (default mode): submits the filled-in registration form, approves the
 * request in the admin portal as the super administrator (separate browser session), then signs in as the new owner.
 */
async function submitRegistrationAndApprove(page: Page, email: string, password = "E2ePassword1") {
  await page.click("button[type=submit]");
  await expect(page.getByTestId("registration-submitted")).toBeVisible();
  const adminContext = await page.context().browser()!.newContext();
  const admin = await adminContext.newPage();
  await login(admin, "owner@demo.ara.sr", "Demo12345!");
  await admin.goto(`/admin/requests?q=${encodeURIComponent(email)}`);
  admin.once("dialog", (d) => d.accept());
  await admin.getByTestId(`request-${email}`).getByTestId("request-approve").click();
  await expect(admin).toHaveURL(/\/admin\/customers\/.+approved=1/);
  await adminContext.close();
  await login(page, email, password);
  await page.goto("/app?welcome=1");
}

test("visitors get Dutch by default and can switch language; the choice persists", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Aanmelden" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "nl-SR");
  await page.getByLabel("Taal").selectOption("en");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Developed by ARA Intelligent Solutions").first()).toBeVisible();
});

test("owner registers, pays a USD-salaried employee and approves payroll (English UI)", async ({ page, context }) => {
  await context.addCookies([{ name: "ARA_LOCALE", value: "en", domain: "localhost", path: "/" }]);
  const email = `owner-${Date.now()}@e2e.test`;
  await page.goto("/register");
  await page.fill("#name", "E2E Owner");
  await page.fill("#email", email);
  await page.fill("#password", "E2ePassword1");
  await page.fill("#organizationName", "E2E Org");
  await page.fill("#companyName", "E2E Company N.V.");
  await page.selectOption("#currency", "SRD");
  await submitRegistrationAndApprove(page, email);
  await resetSchemesOf(email);
  await expect(page.getByText("Welcome to ARA Payroll")).toBeVisible();

  // Employee on a USD salary, paid out in USD
  await page.goto("/app/employees/new");
  await page.fill("#firstName", "Anita");
  await page.fill("#lastName", "Ramsaran");
  await page.fill("#hireDate", "2024-01-01");
  await page.fill("#numberOfChildren", "1");
  await page.selectOption("#salaryCurrency", "USD");
  await page.fill("#baseSalary", "1,200.00");
  await page.selectOption("#paymentCurrency", "USD");
  await page.fill("#pensionEmployeeBp", "2");
  await page.click("button:has-text('Create employee')");
  await expect(page.getByText("Employee created successfully")).toBeVisible();
  await expect(page.getByText("No approved rate USD→SRD yet")).toBeVisible();

  // Validation errors are shown in the selected language
  await page.goto("/app/employees/new");
  await page.click("button:has-text('Create employee')");
  await expect(page.getByText("Please correct the highlighted fields")).toBeVisible();

  // Payroll cannot be calculated without an approved exchange rate
  await page.goto("/app/payroll/new");
  await page.selectOption("#month", "3");
  await page.fill("#year", "2026");
  await page.click("button:has-text('Create payroll run')");
  await expect(page.getByRole("heading", { name: "Payroll March 2026" })).toBeVisible();
  const runUrl = page.url();
  await page.click("button:has-text('Calculate payroll')");
  await expect(page.getByText(/No approved exchange rate available for: USD→SRD/)).toBeVisible();

  // Enter a rate (approval required by default) and approve it
  await page.goto("/app/exchange-rates");
  await page.selectOption("#baseCurrency", "USD");
  await page.selectOption("#quoteCurrency", "SRD");
  await page.fill("#rate", "36.5");
  await page.fill("#effectiveDate", "2026-01-01");
  await page.click("button:has-text('Save rate')");
  await expect(page.getByText("It must be approved")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("Exchange rate approved.")).toBeVisible();

  // Calculate and approve
  await page.goto(runUrl);
  await page.getByLabel(/OT 150/).fill("5");
  await page.click("button:has-text('Save inputs')");
  await expect(page.getByText("Inputs saved. Net pay has been recalculated.")).toBeVisible();
  await page.click("button:has-text('Recalculate')");
  await expect(page.getByText("Calculated 1 payslip")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: /Anita Ramsaran/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^USD / }).last()).toBeVisible();

  // Statutory contribution schemes not yet configured: finalising is blocked until they are approved or marked not applicable.
  await expect(page.getByTestId("statutory-missing")).toBeVisible();
  await page.getByLabel(/I acknowledge that the statutory rules/).check();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/cannot be finalised: the statutory scheme/)).toBeVisible();
  await markStatutoryNotApplicable(page, true);
  await page.goto(runUrl);
  await expect(page.getByTestId("statutory-missing")).toHaveCount(0);

  // Statutory rules are pending legal validation: approval requires an explicit acknowledgement.
  await expect(page.getByText(/pending legal validation/).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(/Tick the acknowledgement to approve/)).toBeVisible();
  await page.getByLabel(/I acknowledge that the statutory rules/).check();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Payroll approved and locked")).toBeVisible();
  await expect(page.getByRole("link", { name: /Bank payment file/ })).toBeVisible();

  const base = page.url().split("?")[0].replace("/app/payroll/", "/api/payroll/");
  const pdf = await page.request.get(`${base}/payslips.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const bank = await (await page.request.get(`${base}/bank.csv`)).text();
  expect(bank).toContain("USD");

  await page.getByRole("link", { name: "View", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/payslips\//);
  await expect(page.getByText("Currency conversions")).toBeVisible();
  await expect(page.getByText("1 USD = 36.5 SRD").first()).toBeVisible();
  await expect(page.getByText("Wage tax (loonbelasting)")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Calculation breakdown" })).toBeVisible();
  await expect(page.getByText("Taxable wage", { exact: true }).first()).toBeVisible();

  // Declaration draft was prepared automatically after approval.
  await page.goto("/app/tax");
  await expect(page.getByText("Draft declaration prepared for March 2026")).toBeVisible();
  await page.getByRole("row", { name: /March 2026/ }).getByRole("link", { name: "View" }).click();
  await expect(page.getByRole("heading", { name: /Payroll tax & AOV return — March 2026/ })).toBeVisible();
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Declaration submitted for review.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Approve and generate files" }).click();
  await expect(page.getByText(/Tick the acknowledgement/)).toBeVisible();
  await page.getByLabel(/this approval is not a legal confirmation/).check();
  await page.getByRole("button", { name: "Approve and generate files" }).click();
  await expect(page.getByText("Declaration approved and files generated.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ready for download").first()).toBeVisible();
  // Recording a submission is not possible before downloading, and downloading never marks it submitted.
  await expect(page.getByRole("button", { name: "Save submission" })).toHaveCount(0);
  const fileLink = page.getByRole("link", { name: /ARA_PayrollTax_E2ECompanyNV_2026-03\.pdf/ });
  const download = await page.request.get((await fileLink.getAttribute("href"))!);
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("application/pdf");
  const xlsx = await page.request.get((await page.getByRole("link", { name: /ARA_AOV_E2ECompanyNV_2026-03\.xlsx/ }).getAttribute("href"))!);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  await page.reload();
  await expect(page.getByText("Downloaded").first()).toBeVisible();
  await expect(page.getByText("Submitted", { exact: true })).toHaveCount(1); // only the step label, not the status
  await page.fill("#reference", "LB-2026-03-TEST");
  await page.getByRole("button", { name: "Save submission" }).click();
  await expect(page.getByText("Submission recorded.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/reference LB-2026-03-TEST/)).toBeVisible();
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();

  // Reopening the payroll is blocked once its declaration has been approved.
  await page.goto(runUrl);
  await page.getByTestId("run-correction").locator("summary").click();
  await page.getByTestId("run-correction").locator("input[name=reason]").fill("Correction of overtime hours after approval");
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText(/require a supplementary declaration/)).toBeVisible();

  await page.goto("/app/audit");
  await expect(page.getByText("payroll.approve")).toBeVisible();
  await expect(page.getByText("rate.approve")).toBeVisible();
  await expect(page.getByText("declaration.recordSubmission")).toBeVisible();

  // Parental leave: registered by HR, approved with a partially paid policy.
  await page.goto("/app/leave/parental");
  await page.selectOption("#leaveTypeId", { label: "Maternity leave" });
  await page.fill("#childBirthDate", "2026-05-01");
  await page.fill("#startDate", "2026-04-06");
  await page.fill("#endDate", "2026-04-10");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText("Leave request submitted for approval.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expect(page.getByText("Leave approved.")).toBeVisible();

  // Pay components: the central library is available and custom components can be created.
  await page.goto("/app/settings/components");
  await expect(page.getByText("ALW001")).toBeVisible();
  await expect(page.getByText("Employer contributions")).toBeVisible();
  await page.getByRole("link", { name: "New component" }).click();
  await page.fill("#code", "CUS001");
  await page.fill("#nameNl", "Gereedschapsvergoeding");
  await page.fill("#nameEn", "Tool allowance");
  await page.fill("#defaultAmount", "250");
  await page.selectOption("#approvalStatus", "APPROVED");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/components\/.+\?created=1/);
});

test("employees cannot access admin areas or other data", async ({ page, request }) => {
  const anon = await request.get("/api/exports/employees", { maxRedirects: 0 });
  expect([307, 401, 403]).toContain(anon.status());

  await page.goto("/login");
  await page.fill("#email", "employee@demo.ara.sr");
  await page.fill("#password", "Demo12345!");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/me$/);
  await page.goto("/app/employees");
  await expect(page).toHaveURL(/\/me$/);
  const res = await page.request.get("/api/exports/employees");
  expect(res.status()).toBe(403);
  await page.goto("/me/payslips");
  await expect(page.getByRole("heading", { name: "Mijn loonstroken" })).toBeVisible();
  await page.goto("/app/admin");
  await expect(page).toHaveURL(/\/me$/);
});

test("accountants can view but not approve declarations; employees cannot open the tax module", async ({ page, context }) => {
  await context.addCookies([{ name: "ARA_LOCALE", value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/login");
  await page.fill("#email", "accountant@demo.ara.sr");
  await page.fill("#password", "Demo12345!");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app$/);
  await page.goto("/app/tax");
  // The account language preference wins over the browser cookie, so accept either language.
  await expect(page.getByRole("heading", { name: /Tax & Declarations|Belasting & Aangiften/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Prepare|Opstellen)$/ })).toHaveCount(0);
  await page.goto("/app/tax/legal");
  await expect(page.getByTestId("legal-source-SB-2024-2")).toContainText("S.B. 2024 no. 2");
  await expect(page.getByTestId("legal-source-FVO")).toContainText(/Geverifieerd|Verified/);
  await expect(page.getByTestId("parameters-in-use")).toBeVisible();
  await page.goto("/app/tax/rules");
  await expect(page.getByText("Loonbelasting S.B. 2024 no. 2 (art. 12, 13, 14)")).toBeVisible();
  await expect(page.getByRole("button", { name: /Create version|Versie aanmaken/ })).toHaveCount(0);

  const emp = await page.context().browser()!.newContext();
  const p2 = await emp.newPage();
  await p2.goto("http://localhost:" + (process.env.E2E_PORT ?? 3100) + "/login");
  await p2.fill("#email", "employee@demo.ara.sr");
  await p2.fill("#password", "Demo12345!");
  await p2.click("button[type=submit]");
  await p2.waitForURL(/\/me$/);
  await p2.goto("http://localhost:" + (process.env.E2E_PORT ?? 3100) + "/app/tax");
  await expect(p2).toHaveURL(/\/me$/);
  expect((await p2.request.get("http://localhost:" + (process.env.E2E_PORT ?? 3100) + "/api/tax/aov?year=2026&month=10")).status()).toBe(403);
  await emp.close();
});

test("login rejects wrong passwords (Dutch message)", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "owner@demo.ara.sr");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.getByText("Onjuist e-mailadres of wachtwoord")).toBeVisible();
});


test("fixed and extra allowances/deductions via dropdowns, duplicate checks and payslip summary (Dutch UI)", async ({ page }) => {
  const email = `fixed-${Date.now()}@e2e.test`;
  await page.goto("/register");
  await page.fill("#name", "Vaste Componenten");
  await page.fill("#email", email);
  await page.fill("#password", "E2ePassword1");
  await page.fill("#organizationName", "Toelagen Org");
  await page.fill("#companyName", "Toelagen N.V.");
  await page.selectOption("#currency", "SRD");
  await submitRegistrationAndApprove(page, email);
  await resetSchemesOf(email);

  await page.goto("/app/employees/new");
  await page.fill("#firstName", "Ravi");
  await page.fill("#lastName", "Jagernath");
  await page.fill("#hireDate", "2024-01-01");
  await page.selectOption("#salaryCurrency", "SRD");
  await page.fill("#baseSalary", "20000");
  await page.click("button:has-text('Werknemer aanmaken')");
  await expect(page.getByText("Werknemer succesvol aangemaakt")).toBeVisible();

  // Personeelsprofiel → Toelagen en inhoudingen
  await page.getByRole("link", { name: "Toelagen en inhoudingen" }).click();
  await expect(page.getByText("A. Vaste toelagen")).toBeVisible();
  await expect(page.getByText("B. Vaste inhoudingen")).toBeVisible();
  await expect(page.getByTestId("section-DEDUCTION").getByText("Loonbelasting", { exact: true })).toBeVisible();

  // The form appears after selecting a component from the dropdown.
  const allowance = page.getByTestId("add-ALLOWANCE-component");
  await allowance.selectOption({ label: "Brandstoftoelage" });
  await page.fill("#add-ALLOWANCE-amount", "500");
  await page.fill("#add-ALLOWANCE-start", "2026-01-01");
  await expect(page.locator("#add-ALLOWANCE-tax")).toHaveValue("CONFIG");
  await page.locator("#add-ALLOWANCE-tax").selectOption("EXEMPT");
  await expect(page.getByText(/maakt een toelage nooit automatisch onbelast/)).toBeVisible();
  await page.locator("#add-ALLOWANCE-tax").selectOption("TAXABLE");
  await page.getByTestId("section-ALLOWANCE").getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText("Brandstoftoelage toegevoegd.")).toBeVisible();
  await expect(page.getByTestId("assignment-ALW013")).toContainText("SRD");

  // Same component again for the same period → duplicate error.
  await allowance.selectOption({ label: "Brandstoftoelage" });
  await page.fill("#add-ALLOWANCE-amount", "500");
  await page.fill("#add-ALLOWANCE-start", "2026-06-01");
  await page.getByTestId("section-ALLOWANCE").getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText(/is al als vaste component toegewezen/)).toBeVisible();

  // Holiday allowance as an accrual, 8% of base salary, paid in March.
  await allowance.selectOption({ label: "Vakantietoelage" });
  await page.locator("#add-ALLOWANCE-calc").selectOption("PERCENT_OF_BASE");
  await page.fill("#add-ALLOWANCE-rate", "8");
  await page.locator("#add-ALLOWANCE-freq").selectOption("ACCRUAL");
  await page.locator("#add-ALLOWANCE-month").selectOption("3");
  await page.fill("#add-ALLOWANCE-start", "2026-01-01");
  await page.getByTestId("section-ALLOWANCE").getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText("Vakantietoelage toegevoegd.")).toBeVisible();

  // Statutory deductions are shown but cannot be selected; a fixed loan repayment can.
  const deduction = page.getByTestId("add-DEDUCTION-component");
  await expect(deduction.locator("option", { hasText: "Loonbelasting (automatisch)" })).toBeDisabled();
  await deduction.selectOption({ label: "Personeelslening" });
  await page.fill("#add-DEDUCTION-amount", "250");
  await page.fill("#add-DEDUCTION-start", "2026-01-01");
  await page.getByTestId("section-DEDUCTION").getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText("Personeelslening toegevoegd.")).toBeVisible();

  // Payroll run for March 2026: fixed components are included automatically.
  await page.goto("/app/payroll/new");
  await page.selectOption("#month", "3");
  await page.fill("#year", "2026");
  await page.click("button:has-text('Verloning aanmaken')");
  await page.getByRole("button", { name: "Salarissen berekenen" }).click();
  await expect(page.getByText(/1 loonstrook|1 loonstroken/).first()).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Opstellen" }).first().click();
  await expect(page.getByRole("heading", { name: /Loonstrook opstellen — Ravi Jagernath/ })).toBeVisible();
  await expect(page.getByTestId("compose-row-ALW013")).toContainText("Wordt verwerkt");
  await expect(page.getByTestId("compose-row-BON006")).toContainText("Uitbetaling opbouw");

  // Extra allowance via the dropdown; the payslip is recalculated straight away.
  await page.getByTestId("extra-ALLOWANCE-component").selectOption({ label: "Gratificatie" });
  await page.fill("#extra-ALLOWANCE-amount", "1000");
  await page.getByTestId("compose-extra-ALLOWANCE").getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText(/Gratificatie toegevoegd aan 1 loonstrook\. Nettoloon is opnieuw berekend\./)).toBeVisible();

  // A component that already applies as fixed cannot silently be entered again.
  await page.getByTestId("extra-ALLOWANCE-component").selectOption({ label: "Brandstoftoelage" });
  await page.fill("#extra-ALLOWANCE-amount", "500");
  await page.getByTestId("compose-extra-ALLOWANCE").getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByText(/wordt al als vaste component verwerkt/)).toBeVisible();

  // Adjust the fixed fuel allowance for this payslip only.
  await page.getByTestId("compose-row-ALW013").getByLabel("Bedrag voor deze loonstrook").fill("600");
  await page.getByTestId("compose-row-ALW013").getByRole("button", { name: "Aanpassen" }).click();
  await expect(page.getByText(/Bedrag voor deze loonstrook aangepast/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("compose-row-ALW013")).toContainText("Aangepast: SRD");

  const calc = page.getByTestId("compose-calculation");
  for (const row of ["Basissalaris", "Vaste toelagen", "Incidentele toelagen", "Brutosalaris", "Belastbare grondslag", "Loonbelasting", "AOV", "Overige inhoudingen", "Totale inhoudingen", "Nettosalaris", "Onbelaste kostenvergoedingen", "Totaal uit te betalen"]) {
    await expect(calc.getByRole("cell", { name: row, exact: true })).toBeVisible();
  }
  // Fixed: fuel 600 (adjusted) + holiday allowance paid out in March: 8% of 20,000 = 1,600 (no earlier payslips
  // accrued in this new company) → 2,200; incidental: gratuity 1,000.
  await expect(calc.getByRole("row", { name: /^Vaste toelagen/ })).toContainText("2.200,00");
  await expect(calc.getByRole("row", { name: /^Incidentele toelagen/ })).toContainText("1.000,00");
  await expect(calc.getByRole("row", { name: /^Brutosalaris/ })).toContainText("23.200,00");
  await expect(page.getByTestId("payslip-summary")).toBeVisible();

  const pdf = await page.request.get((await page.getByRole("link", { name: /PDF/ }).first().getAttribute("href"))!);
  expect(pdf.status()).toBe(200);
  const composeUrl = page.url();

  // Statutory schemes still missing: finalising is blocked until they are approved or marked not applicable.
  await expect(page.getByTestId("statutory-missing")).toBeVisible();
  await page.getByLabel(/Ik bevestig dat de wettelijke regels/).check();
  await page.getByRole("button", { name: "Goedkeuren", exact: true }).click();
  await expect(page.getByText(/kan niet definitief worden gemaakt/).first()).toBeVisible();
  await markStatutoryNotApplicable(page);

  // A salary change after calculation: approval recalculates first and refuses to approve outdated figures.
  await page.goto(composeUrl.replace(/\/app\/payroll\/[^/]+\/employees\/([^/?]+).*/, "/app/employees/$1?tab=contracts"));
  await page.fill("#baseSalary", "21000");
  await page.fill("#startDate", "2026-03-01");
  await page.getByRole("button", { name: "Overeenkomst opslaan" }).click();
  await expect(page.getByText("Nieuwe overeenkomst / salariswijziging vastgelegd.")).toBeVisible();
  await page.goto(composeUrl);
  await page.getByLabel(/Ik bevestig dat de wettelijke regels/).check();
  await page.getByRole("button", { name: "Goedkeuren", exact: true }).click();
  await expect(page.getByText(/De gegevens zijn gewijzigd sinds de laatste berekening/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("compose-calculation").getByRole("row", { name: /^Brutosalaris/ })).toContainText("24.280,00"); // 21,000 + fuel 600 + holiday 8% × 21,000 + gratuity 1,000
  await page.getByLabel(/Ik bevestig dat de wettelijke regels/).check();
  await page.getByRole("button", { name: "Goedkeuren", exact: true }).click();
  await expect(page.getByText(/Salarisadministratie goedgekeurd en vergrendeld/)).toBeVisible();
  // Approved: the compose page is read-only and no longer offers changes.
  await page.goto(composeUrl);
  await expect(page.getByText(/Deze loonrun is definitief/)).toBeVisible();
  await expect(page.getByTestId("extra-ALLOWANCE-component")).toHaveCount(0);
});

test("employee and employer contributions: scheme setup, payroll, payslip, reports (Dutch and English UI)", async ({ page }) => {
  const contribEmail = `contrib-${Date.now()}@e2e.test`;
  await page.goto("/register");
  await page.fill("#name", "Bijdragen Beheerder");
  await page.fill("#email", contribEmail);
  await page.fill("#password", "E2ePassword1");
  await page.fill("#organizationName", "Bijdragen Org");
  await page.fill("#companyName", "Bijdragen N.V.");
  await page.selectOption("#currency", "SRD");
  await submitRegistrationAndApprove(page, contribEmail);
  await resetSchemesOf(contribEmail);

  await page.goto("/app/employees/new");
  await page.fill("#firstName", "Maya");
  await page.fill("#lastName", "Sewdien");
  await page.fill("#hireDate", "2024-01-01");
  await page.selectOption("#salaryCurrency", "SRD");
  await page.fill("#baseSalary", "20000");
  await page.click("button:has-text('Werknemer aanmaken')");
  await expect(page.getByText("Werknemer succesvol aangemaakt")).toBeVisible();
  const employeeUrl = page.url().split("?")[0];

  // Settings → Bijdragen: the three schemes exist, inactive and without rates.
  await page.goto("/app/settings/contributions");
  await expect(page.getByRole("link", { name: "Bijdragen", exact: true })).toBeVisible();
  await expect(page.getByText(/vult alleen tarieven in die zijn geverifieerd/)).toBeVisible();
  // Validation overview: nothing configured yet; statutory schemes block finalising payroll.
  for (const type of ["HEALTH", "PENSION", "FVO"]) await expect(page.getByTestId(`validation-${type}`)).toContainText("Niet geconfigureerd");
  await expect(page.getByTestId("validation-HEALTH")).toContainText("blokkeert het definitief maken");
  await expect(page.getByTestId("validation-PENSION")).toContainText("blokkeert"); // Wet Algemeen Pensioen 2014: statutory
  await expect(page.getByTestId("payroll-blocked")).toContainText("Ziektekostenverzekering, Pensioenbijdrage, FVO-bijdrage");
  await expect(page.getByTestId("fvo-notice")).toHaveCount(0); // FVO verified against S.B. 2019 no. 64

  // Approving without rates is refused.
  page.on("dialog", (dlg) => dlg.accept());
  await page.getByTestId("validation-FVO").getByRole("link", { name: "Instellen" }).click();
  await page.getByRole("button", { name: "Tarieven goedkeuren en activeren" }).click();
  await expect(page.getByText("Vul een werknemers- of werkgeverstarief in voordat u de regeling activeert.").first()).toBeVisible();

  // Health insurance 2% / 3% and pension 4% / 6% (pre-tax).
  const configure = async (type: string, ee: string, er: string, preTax = false) => {
    await page.goto("/app/settings/contributions");
    await page.getByTestId(`scheme-${type}`).getByRole("link", { name: "Bewerken" }).click();
    await expect(page.getByTestId("scheme-legal")).toBeVisible(); // legal basis from the register
    await page.selectOption("#method", "PERCENTAGE");
    await page.fill("#employeeRate", ee);
    await page.fill("#employerRate", er);
    await page.fill("#effectiveFrom", "2026-01-01");
    if (preTax) await page.selectOption("#employeeTax", "PRE_TAX");
    await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
    await expect(page.getByText("Regeling opgeslagen.")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("scheme-status")).toContainText("Wacht op goedkeuring"); // rates alone do not activate
    // A statutory scheme can only be approved once its legal basis is verified.
    await page.getByRole("button", { name: "Tarieven goedkeuren en activeren" }).click();
    await expect(page.getByText(/kan pas worden goedgekeurd nadat de juridische grondslag is geverifieerd/)).toBeVisible();
    await page.selectOption("#legalStatus", "VERIFIED"); // the administrator verified the official text
    await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
    await expect(page.getByText("Regeling opgeslagen.")).toBeVisible();
    await page.getByRole("button", { name: "Tarieven goedkeuren en activeren" }).click();
    await expect(page.getByText(/is goedgekeurd en actief/)).toBeVisible();
  };
  await configure("HEALTH", "2", "3");
  await configure("PENSION", "4", "6", true);
  await page.goto("/app/settings/contributions");
  await expect(page.getByTestId("validation-HEALTH")).toContainText("Actief");
  await expect(page.getByTestId("payroll-blocked")).toContainText("FVO-bijdrage"); // FVO still open

  // A rate change resets the approval: the scheme stops being used until it is approved again.
  await page.getByTestId("validation-PENSION").getByRole("link", { name: "Instellen" }).click();
  await page.fill("#employerRate", "6,5");
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  await expect(page.getByText(/de regeling is gedeactiveerd tot ze opnieuw is goedgekeurd/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("scheme-status")).toContainText("Wacht op goedkeuring");
  await page.fill("#employerRate", "6");
  await page.getByRole("button", { name: "Wijzigingen opslaan" }).click();
  await expect(page.getByText("Regeling opgeslagen.")).toBeVisible();
  await page.getByRole("button", { name: "Tarieven goedkeuren en activeren" }).click();
  await expect(page.getByText(/is goedgekeurd en actief/)).toBeVisible();

  // Employee profile: contributions section and the renamed dropdowns.
  await page.goto(`${employeeUrl}?tab=pay`);
  await expect(page.getByText("Componenten van het bedrijf")).toHaveCount(0);
  await expect(page.getByTestId("section-ALLOWANCE").getByText("Toelagen", { exact: true })).toBeVisible();
  await expect(page.getByTestId("section-DEDUCTION").getByText("Inhoudingen", { exact: true })).toBeVisible();
  await expect(page.getByTestId("contribution-HEALTH")).toContainText("2%");
  await expect(page.getByTestId("contribution-HEALTH")).toContainText("3%");
  await expect(page.getByTestId("contribution-PENSION")).toContainText("Neemt deel");
  const ded = page.getByTestId("add-DEDUCTION-component");
  await expect(ded.locator("option", { hasText: "Loonbelasting (automatisch)" })).toBeDisabled();
  await ded.selectOption({ label: "Pensioen – werknemersaandeel" });
  await expect(page.getByTestId("add-DEDUCTION-scheme-info")).toContainText("Pensioenregeling");

  // Individual employer rate for health insurance: 4% instead of 3%.
  await page.getByTestId("contribution-HEALTH").getByText("Deelname of tarief aanpassen").click();
  await page.getByTestId("contribution-HEALTH").getByLabel("Afwijkend werkgeverspercentage (%)").fill("4");
  await page.getByTestId("contribution-HEALTH").getByRole("button", { name: "Opslaan" }).click();
  await expect(page.getByText("Deelname aan Ziektekostenverzekering opgeslagen.")).toBeVisible();

  // Payroll: employee shares deducted, employer shares only in employer costs.
  await page.goto("/app/payroll/new");
  await page.selectOption("#month", "3");
  await page.fill("#year", "2026");
  await page.click("button:has-text('Verloning aanmaken')");
  await page.getByRole("button", { name: "Salarissen berekenen" }).click();
  await expect(page.getByText(/1 loonstrook/).first()).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Bekijken" }).first().click();
  await expect(page).toHaveURL(/\/app\/payslips\//);
  const ded2 = page.getByTestId("payslip-deductions");
  await expect(ded2.getByText("Ziektekostenverzekering werknemer")).toBeVisible();
  await expect(ded2.getByText("Pensioen werknemer")).toBeVisible();
  const er = page.getByTestId("payslip-employer");
  await expect(er.getByText("Ziektekostenverzekering werkgever")).toBeVisible();
  await expect(er).toContainText("800,00"); // 4% of 20,000 (individual employer rate)
  await expect(er).toContainText("1.200,00"); // pension employer 6%
  // Total employment costs = gross 20,000 + employer contributions 2,000.
  await expect(page.getByTestId("payslip-employment-cost")).toContainText("22.000,00");
  await expect(page.getByTestId("payslip-income").getByText("Basissalaris")).toBeVisible();
  const pdf = await page.request.get((await page.getByRole("link", { name: /PDF/ }).first().getAttribute("href"))!);
  expect(pdf.status()).toBe(200);

  // Reports: totals per scheme, employee and employer side (includes calculated runs only after approval).
  await page.goto("/app/reports");
  await expect(page.getByTestId("report-contributions").getByText("Werknemers- en werkgeversbijdragen")).toBeVisible();
  const csv = await page.request.get("/api/reports/contributions?year=2026");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Werkgeverslasten");

  // English UI.
  await page.getByLabel("Taal").first().selectOption("en");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible(); // locale saved before navigating
  await page.goto(`${employeeUrl}?tab=pay`);
  await expect(page.getByTestId("section-ALLOWANCE").getByText("Allowances", { exact: true })).toBeVisible();
  await expect(page.getByTestId("section-DEDUCTION").getByText("Deductions", { exact: true })).toBeVisible();
  await expect(page.getByTestId("section-CONTRIBUTIONS").getByText("Employer Contribution").first()).toBeVisible();
  await page.goBack();
  await page.goto("/app/payroll");
  await page.getByRole("link", { name: /March 2026/ }).first().click();
  await page.goto((await page.locator("a[href^='/app/payslips/']").first().getAttribute("href"))!);
  await expect(page.getByTestId("payslip-employer").getByText("Employer contributions", { exact: true })).toBeVisible();
  await expect(page.getByTestId("payslip-employment-cost")).toContainText("Total Employment Costs");
});

test("website pricing section: navigation, plans, working buttons, demo/quote requests (NL + EN, mobile)", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Professionele salarisadministratie. Nauwkeurig geregeld, elke maand opnieuw.");
  await page.getByRole("link", { name: "Prijzen", exact: true }).click();
  await expect(page).toHaveURL(/#prijzen$/);
  await expect(page.locator("#prijzen")).toBeInViewport();

  const plans = [
    ["starter", "Starter", "SRD 750", "Start met Starter", /\/register\?plan=starter$/],
    ["business", "Business", "SRD 1.500", "Kies Business", /\/register\?plan=business$/],
    ["professional", "Professional", "SRD 2.750", "Kies Professional", /\/register\?plan=professional$/],
    ["enterprise", "Enterprise", "Prijs op aanvraag", "Vraag een offerte aan", /\/contact\?type=quote&plan=enterprise$/],
  ] as const;
  for (const [id, name, price, cta, href] of plans) {
    const card = page.getByTestId(`plan-${id}`);
    await expect(card.getByRole("heading", { name })).toBeVisible();
    await expect(card).toContainText(price);
    await expect(card.getByRole("link", { name: cta })).toHaveAttribute("href", href);
  }
  await expect(page.getByTestId("plan-business").getByText("Populair")).toBeVisible();
  await expect(page.getByTestId("plan-starter").getByText("Populair")).toHaveCount(0);
  await expect(page.getByTestId("plan-business")).toContainText("Vakantietoelage en bonussen");
  await expect(page.getByTestId("trial-banner")).toContainText("Ontdek ARA Payroll – Start met 30 dagen gratis testen.");

  // Every link on the page leads to a working page.
  const hrefs = await page.locator("a[href^='/']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
  for (const h of hrefs) expect((await page.request.get(h)).status(), h).toBe(200);

  // Plan button → registration with the chosen plan.
  await page.getByTestId("plan-business").getByRole("link", { name: "Kies Business" }).click();
  await expect(page.getByTestId("chosen-plan")).toContainText("Gekozen pakket: Business");
  await page.goto("/");
  await page.getByTestId("trial-banner").getByRole("link", { name: "Start gratis proefperiode" }).click();
  await expect(page).toHaveURL(/\/register/);

  // Demo request: validation, then stored.
  await page.goto("/");
  await page.getByRole("link", { name: "Plan een gratis demo" }).click();
  await expect(page.getByRole("heading", { name: "Plan een gratis demo" })).toBeVisible();
  await page.getByRole("button", { name: "Demo aanvragen" }).click();
  await expect(page.getByText("Corrigeer de gemarkeerde velden").first()).toBeVisible();
  const company = `Demo Klant ${Date.now()} N.V.`;
  await page.fill("#name", "Ravi Test");
  await page.fill("#company", company);
  await page.fill("#email", "ravi@example.sr");
  await page.fill("#employees", "25");
  await page.getByRole("button", { name: "Demo aanvragen" }).click();
  await expect(page.getByText(/Uw demo-aanvraag is ontvangen/)).toBeVisible();

  // Quote request from the Enterprise card.
  await page.goto("/contact?type=quote&plan=enterprise");
  await expect(page.locator("#plan")).toHaveValue("enterprise");
  await page.fill("#name", "Anita Test");
  await page.fill("#company", `${company} Groep`);
  await page.fill("#email", "anita@example.sr");
  await page.getByRole("button", { name: "Offerte aanvragen" }).click();
  await expect(page.getByText(/Uw offerte-aanvraag is ontvangen/)).toBeVisible();

  // Requests are visible to the platform administrator.
  await page.goto("/login");
  await page.fill("#email", "owner@demo.ara.sr");
  await page.fill("#password", "Demo12345!");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app/);
  await page.goto("/app/admin");
  const demoRow = page.getByTestId("contact-requests").getByRole("row").filter({ hasText: "ravi@example.sr" }).filter({ hasText: company }).first();
  await expect(demoRow).toContainText("Demo");
  await expect(demoRow).toContainText("25 medewerkers");
  const quoteRow = page.getByTestId("contact-requests").getByRole("row").filter({ hasText: `${company} Groep` });
  await expect(quoteRow).toContainText("Enterprise");
  await quoteRow.getByRole("button", { name: "Afgehandeld" }).click();
  await expect(page.getByText("Aanvraag gemarkeerd als afgehandeld.")).toBeVisible();

  // English website.
  await context.clearCookies();
  await context.addCookies([{ name: "ARA_LOCALE", value: "en", domain: "localhost", path: "/" }]);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Professional payroll administration. Accurately handled, every month.");
  await expect(page.getByRole("link", { name: "Pricing", exact: true })).toHaveAttribute("href", "/#prijzen");
  await expect(page.getByTestId("plan-business")).toContainText("SRD 1,500");
  await expect(page.getByTestId("plan-business").getByText("Popular")).toBeVisible();
  await expect(page.getByTestId("plan-enterprise").getByRole("link", { name: "Request a quote" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a free demo" })).toBeVisible();
  await expect(page.getByTestId("trial-banner").getByRole("link", { name: "Start free trial" })).toBeVisible();

  // Mobile: no horizontal scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#prijzen");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
