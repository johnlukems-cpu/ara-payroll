import { expect, test } from "@playwright/test";

test("owner registers, adds an employee, runs and approves payroll", async ({ page }) => {
  const email = `owner-${Date.now()}@e2e.test`;
  await page.goto("/register");
  await page.fill("#name", "E2E Owner");
  await page.fill("#email", email);
  await page.fill("#password", "E2ePassword1");
  await page.fill("#organizationName", "E2E Org");
  await page.fill("#companyName", "E2E Company N.V.");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/\/app\?welcome=1/);
  await expect(page.getByText("Welcome to ARA Payroll")).toBeVisible();
  await expect(page.getByText("ARA Payroll").first()).toBeVisible();

  // Add employee
  await page.goto("/app/employees/new");
  await page.fill("#firstName", "Anita");
  await page.fill("#lastName", "Ramsaran");
  await page.fill("#hireDate", "2024-01-01");
  await page.fill("#numberOfChildren", "1");
  await page.fill("#baseSalary", "20,000.00");
  await page.fill("#pensionEmployeeBp", "2");
  await page.click("button:has-text('Create employee')");
  await expect(page.getByText("Employee created successfully")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Anita Ramsaran" })).toBeVisible();

  // Validation errors are shown
  await page.goto("/app/employees/new");
  await page.click("button:has-text('Create employee')");
  await expect(page.getByText("Please correct the highlighted fields")).toBeVisible();

  // Payroll run
  await page.goto("/app/payroll/new");
  await page.selectOption("#month", "3");
  await page.fill("#year", "2026");
  await page.click("button:has-text('Create payroll run')");
  await expect(page.getByRole("heading", { name: "Payroll March 2026" })).toBeVisible();
  await page.getByLabel("Overtime 150%").fill("5");
  await page.click("button:has-text('Save inputs')");
  await expect(page.getByText("Inputs saved")).toBeVisible();
  await page.click("button:has-text('Calculate payroll')");
  await expect(page.getByText("Calculated 1 payslip")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("cell", { name: /Anita Ramsaran/ })).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Approve')");
  await expect(page.getByText("Payroll approved and locked")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: /Bank payment file/ })).toBeVisible();

  const pdf = await page.request.get(page.url().split("?")[0].replace("/app/payroll/", "/api/payroll/") + "/payslips.pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");

  await page.getByRole("link", { name: "View", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app\/payslips\//);
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expect(page.getByText("Wage tax (loonbelasting)")).toBeVisible();

  // Audit trail recorded
  await page.goto("/app/audit");
  await expect(page.getByText("payroll.approve")).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "My payslips" })).toBeVisible();
});

test("login rejects wrong passwords", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "owner@demo.ara.sr");
  await page.fill("#password", "wrong-password");
  await page.click("button[type=submit]");
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});
