import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Employee lifecycle (automatic number, archive, reactivate), document management (category, view, archive,
 * history), leave calendar and balance corrections, HR reports with CSV / Excel / PDF exports.
 * Runs on the demo company with its own test employee.
 */
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

async function loginDemo(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "owner@demo.ara.sr");
  await page.fill("#password", "Demo12345!");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app/);
}

test("employees, documents, leave and HR reports (Dutch UI)", async ({ page }) => {
  test.setTimeout(120_000);
  await loginDemo(page);
  const ts = Date.now();
  const lastName = `Archief${ts}`;

  // Automatic personnel number: left empty → next free number.
  await page.goto("/app/employees/new");
  const suggested = await page.inputValue("#employeeNumber");
  expect(Number(suggested)).toBeGreaterThan(1000);
  await page.fill("#employeeNumber", "");
  await page.fill("#firstName", "Testa");
  await page.fill("#lastName", lastName);
  await page.fill("#hireDate", "2024-01-01");
  await page.fill("#baseSalary", "15000");
  await page.click("button:has-text('Werknemer aanmaken')");
  await expect(page.getByText("Werknemer succesvol aangemaakt")).toBeVisible();
  const emp = await db.employee.findFirstOrThrow({ where: { lastName } });
  expect(emp.employeeNumber).toBe(suggested);
  const empUrl = page.url().split("?")[0];

  // Documents: upload with category, view, archive, restore, history.
  await page.goto(`${empUrl}?tab=documents`);
  await page.selectOption("select[name=category]", "EMPLOYMENT_CONTRACT");
  await page.fill("input[name=description]", "Getekende overeenkomst 2024");
  await page.setInputFiles("input[name=file]", { name: "contract.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%test\n") });
  await page.getByRole("button", { name: "Uploaden" }).click();
  await expect(page.getByText("Document geüpload.")).toBeVisible();
  await page.reload();
  const row = page.getByTestId("documents-active").getByTestId("doc-contract.pdf");
  await expect(row).toContainText("Arbeidsovereenkomst");
  await expect(row).toContainText("Getekende overeenkomst 2024");
  const doc = await db.employeeDocument.findFirstOrThrow({ where: { employeeId: emp.id } });
  const view = await page.request.get(`/api/documents/${doc.id}?view=1`);
  expect(view.status()).toBe(200);
  expect(view.headers()["content-disposition"]).toMatch(/^inline/);
  expect((await page.request.get(`/api/documents/${doc.id}`)).headers()["content-disposition"]).toMatch(/^attachment/);
  await row.getByRole("button", { name: "Archiveren" }).click();
  await expect(page.getByText("Document gearchiveerd.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("documents-archived")).toContainText("contract.pdf");
  await page.getByTestId("documents-archived").getByRole("button", { name: "Terugzetten" }).click();
  await expect(page.getByText("Document teruggezet.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("documents-history")).toContainText("Geüpload");
  await expect(page.getByTestId("documents-history")).toContainText("Gearchiveerd");
  await expect(page.getByTestId("documents-history")).toContainText("Bekeken");

  // Archive (leaving) and reactivate.
  await page.goto(empUrl);
  await page.getByTestId("employee-archive").locator("summary").click();
  await page.getByTestId("employee-archive").locator("input[name=terminationDate]").fill("2025-06-30");
  await page.getByTestId("employee-archive").locator("input[name=reason]").fill("Einde contract");
  await page.getByTestId("employee-archive").locator("button[type=submit]").click();
  await expect(page.getByText(/Werknemer gearchiveerd/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("employee-archived")).toBeVisible();
  await page.goto("/app/employees");
  await expect(page.locator("body")).not.toContainText(lastName); // archived employees are hidden by default
  await page.goto(empUrl);
  await page.getByTestId("employee-reactivate").click();
  await expect(page.getByText("Werknemer opnieuw geactiveerd.")).toBeVisible();
  expect((await db.employee.findUniqueOrThrow({ where: { id: emp.id } })).status).toBe("ACTIVE");

  // Leave: balance correction and overview, calendar.
  await page.goto("/app/leave/overview");
  await expect(page.getByTestId("leave-balances")).toBeVisible();
  await page.getByTestId("leave-adjust").locator("summary").click();
  await page.getByTestId("leave-adjust").locator("select[name=employeeId]").selectOption(emp.id);
  await page.getByTestId("leave-adjust").locator("input[name=days]").fill("2,5");
  await page.getByTestId("leave-adjust").locator("input[name=reason]").fill("Beginsaldo overgenomen");
  await page.getByTestId("leave-adjust").locator("button[type=submit]").click();
  await expect(page.getByText("Verlofsaldo gecorrigeerd.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("leave-adjustments")).toContainText("Beginsaldo overgenomen");
  await page.goto("/app/leave/calendar");
  await expect(page.getByRole("heading", { name: /Verlofkalender/ })).toBeVisible();

  // HR reports with exports.
  await page.goto("/app/reports");
  await page.getByTestId("to-hr-reports").click();
  await expect(page.getByTestId("hr-report-roster")).toContainText(lastName);
  for (const [fmt, type] of [["csv", "text/csv"], ["xlsx", "spreadsheetml"], ["pdf", "application/pdf"]] as const) {
    const r = await page.request.get(`/api/reports/hr?kind=roster&format=${fmt}`);
    expect(r.status(), fmt).toBe(200);
    expect(r.headers()["content-type"]).toContain(type);
  }
  for (const kind of ["departments", "movement", "contracts", "costs"]) {
    await page.goto(`/app/reports/hr?kind=${kind}`);
    await expect(page.locator("h3").first()).toBeVisible();
    expect((await page.request.get(`/api/reports/hr?kind=${kind}&format=pdf`)).status(), kind).toBe(200);
  }
  for (const url of ["/api/reports/tax?format=xlsx", "/api/reports/annual?format=pdf", "/api/reports/contributions?format=xlsx&part=employees"]) {
    expect((await page.request.get(url)).status(), url).toBe(200);
  }

  // An allowance starting after the payroll period is flagged on the run page (it does not count there).
  const comp = await db.payComponent.findFirstOrThrow({ where: { companyId: emp.companyId, isActive: true, kind: "ALLOWANCE" } });
  await db.employeePayComponent.create({ data: { employeeId: emp.id, componentId: comp.id, amount: 100000, calcType: "FIXED", frequency: "MONTHLY", startDate: new Date("2030-02-03"), isActive: true } as never });
  const run = await db.payrollRun.create({ data: { companyId: emp.companyId, year: 2030, month: 1, payDate: new Date("2030-01-25") } });
  await page.goto(`/app/payroll/${run.id}`);
  await expect(page.getByTestId("future-components")).toBeVisible();
  await expect(page.locator("body")).toContainText(lastName);
  await db.payrollRun.delete({ where: { id: run.id } });

  // One start date for all recurring allowances (e.g. from 1 January).
  await page.goto(`${empUrl}?tab=pay`);
  await page.getByTestId("set-components-start").locator("summary").click();
  await page.getByTestId("set-components-start").locator("input[name=startDate]").fill("2026-01-01");
  await page.getByTestId("set-components-start").locator("button[type=submit]").click();
  await expect(page.getByText(/Ingangsdatum aangepast voor 1 toelage of inhouding/)).toBeVisible();
  const moved = await db.employeePayComponent.findMany({ where: { employeeId: emp.id } });
  expect(moved.map((m) => m.startDate.toISOString().slice(0, 10))).toEqual(["2026-01-01"]);

  // Clean up the test employee.
  await db.employee.delete({ where: { id: emp.id } });
});
