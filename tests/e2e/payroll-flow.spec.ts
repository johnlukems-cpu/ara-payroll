import { expect, test } from "@playwright/test";

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
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/app\?welcome=1/);
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
  await expect(page.getByText("Inputs saved")).toBeVisible();
  await page.click("button:has-text('Calculate payroll')");
  await expect(page.getByText("Calculated 1 payslip")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: /Anita Ramsaran/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /^USD / }).last()).toBeVisible();

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
  await expect(page.getByText(/S.B. 2024 no. 2 — Staatsbesluit/)).toBeVisible();
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

