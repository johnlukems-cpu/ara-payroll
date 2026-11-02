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

  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Approve')");
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

  await page.goto("/app/audit");
  await expect(page.getByText("payroll.approve")).toBeVisible();
  await expect(page.getByText("rate.approve")).toBeVisible();
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

test("login rejects wrong passwords (Dutch message)", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "owner@demo.ara.sr");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.getByText("Onjuist e-mailadres of wachtwoord")).toBeVisible();
});

