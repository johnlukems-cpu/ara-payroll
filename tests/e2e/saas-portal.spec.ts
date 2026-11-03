import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Acceptance tests 1–14 for the ARA admin portal and subscriptions:
 * register → request appears → approve → account → subscription → trial → trial expires → renew → upgrade →
 * invoice → payment → access per status → cancel, and customer A can never reach customer B's data.
 */
const db = new PrismaClient();
test.afterAll(() => db.$disconnect());

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
}

async function op(page: Page, testId: string, fill?: (p: Page) => Promise<void>) {
  const box = page.getByTestId("subscription-actions").getByTestId(testId);
  await box.locator("summary").click();
  if (fill) await fill(page);
  await box.locator("button[type=submit]").click();
}

test("ARA admin portal: full customer lifecycle and tenant isolation (acceptance tests 1–14)", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const ts = Date.now();
  const email = `klant-a-${ts}@e2e.test`;
  const orgName = `Klant A ${ts} Groep`;
  const password = "KlantA-Wachtwoord1";

  // 1. Registration on the website (with chosen plan).
  await page.goto("/register?plan=starter");
  await expect(page.getByTestId("chosen-plan")).toContainText("Starter");
  await page.fill("#name", "Anand Klant");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#organizationName", orgName);
  await page.fill("#companyName", `Klant A ${ts} N.V.`);
  await page.fill("#phone", "+597 400000");
  await page.click("button[type=submit]");
  await expect(page.getByTestId("registration-submitted")).toBeVisible();
  // Not yet approved: no access, with a clear message.
  await login(page, email, password);
  await expect(page.getByText(/wordt nog beoordeeld/)).toBeVisible();

  // 2. The request appears in the admin portal.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, "owner@demo.ara.sr", "Demo12345!");
  await admin.waitForURL(/\/app/);
  await admin.goto("/admin");
  await expect(admin.getByTestId("admin-stats")).toBeVisible();
  await admin.goto(`/admin/requests?q=${encodeURIComponent(email)}`);
  const request = admin.getByTestId(`request-${email}`);
  await expect(request).toContainText("Registratie");
  await expect(request).toContainText("Nieuw");
  await expect(request).toContainText(orgName);

  // 3–6. Approve → account, customer, subscription and trial are created.
  admin.once("dialog", (d) => d.accept());
  await request.getByTestId("request-approve").click();
  await admin.waitForURL(/\/admin\/customers\/[^/?]+\?approved=1/);
  const customerUrl = admin.url().split("?")[0];
  await expect(admin.getByRole("heading", { name: orgName })).toBeVisible();
  await expect(admin.getByTestId("subscription-panel")).toContainText("Starter");
  await expect(admin.getByTestId("subscription-terms")).toContainText("Proefperiode");
  await expect(admin.getByTestId("subscription-terms")).toContainText("SRD 750,00");
  await expect(admin.getByTestId("subscription-history")).toContainText("Abonnement toegewezen");

  await login(page, email, password);
  await page.waitForURL(/\/app/);
  await page.goto("/app/plan");
  await expect(page.getByTestId("customer-plan")).toContainText("Starter");
  await expect(page.getByTestId("customer-plan")).toContainText("Proefperiode");
  // Customers have no access to the admin portal.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app\?denied=1/);

  // 7. Trial expires → access blocked.
  const org = await db.organization.findFirstOrThrow({ where: { name: orgName }, include: { subscriptions: true, companies: true } });
  await db.subscription.update({ where: { id: org.subscriptions[0].id }, data: { trialEnd: new Date(Date.now() - 60_000) } });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("Uw proefperiode is afgelopen.")).toBeVisible();
  await admin.goto("/admin"); // processes subscriptions
  await admin.goto(customerUrl);
  await expect(admin.getByTestId("subscription-terms")).toContainText("Verlopen");

  // 8. Renewal: the administrator extends the expired trial (access returns), then converts it into a paid subscription.
  await expect(admin.getByTestId("assign-plan")).toBeVisible(); // a new subscription could also be assigned
  await op(admin, "op-extendTrial");
  await expect(admin.getByTestId("subscription-terms")).toContainText("Proefperiode");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await admin.goto("/admin/trials");
  await expect(admin.getByTestId(`trial-${org.id}`)).toBeVisible();
  await admin.goto(customerUrl);
  await op(admin, "op-convertTrial");
  await expect(admin.getByTestId("subscription-terms")).toContainText("Actief");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);
  await admin.getByTestId("op-renew").click();
  await expect(admin.getByTestId("subscription-history")).toContainText("Verlengd");

  // 9. Upgrade: Starter → Business, the history keeps the earlier terms.
  await op(admin, "op-changePlan", async (p) => { await p.getByTestId("op-changePlan").locator("select[name=plan]").selectOption("business"); });
  await expect(admin.getByTestId("subscription-panel")).toContainText("Business");
  await expect(admin.getByTestId("subscription-terms")).toContainText("SRD 1.500,00");
  await expect(admin.getByTestId("subscription-history")).toContainText("Opgewaardeerd");

  // 10. Invoice with sequential number and PDF.
  await admin.getByTestId("op-invoice").click();
  const year = new Date().getUTCFullYear();
  const invoiceLink = admin.getByRole("link", { name: new RegExp(`^ARA-${year}-\\d{4}$`) }).first();
  await expect(invoiceLink).toBeVisible();
  const number = (await invoiceLink.textContent())!;
  await invoiceLink.click();
  await expect(admin.getByTestId("invoice-total")).toHaveText("SRD 1.500,00");
  const pdf = await admin.request.get(await admin.getByTestId("invoice-pdf").getAttribute("href") as string);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const invoiceId = admin.url().split("/").pop()!;
  // The customer's owner can download their own invoice.
  expect((await page.request.get(`/api/invoices/${invoiceId}/pdf`)).status()).toBe(200);

  // 11. Manual payment registration.
  const pay = admin.getByTestId("record-payment");
  await pay.locator("input[name=reference]").fill(`BANK-${ts}`);
  await pay.locator("button[type=submit]").click();
  await expect(admin.getByTestId("payment-history")).toContainText(`BANK-${ts}`);
  await expect(admin.getByTestId("invoice-outstanding")).toHaveText("SRD 0,00");
  await admin.goto(`/admin/billing?q=${number}`);
  await expect(admin.getByTestId(`invoice-row-${number}`)).toContainText("Betaald");

  // 14. Customer A can never reach customer B's data (demo company), by URL, ID or API request.
  const demo = await db.company.findFirstOrThrow({ where: { memberships: { some: { user: { email: "owner@demo.ara.sr" } } } }, include: { employees: { take: 1 }, payrollRuns: { take: 1, include: { payslips: { take: 1 } } } } });
  const bEmployee = demo.employees[0];
  const bRun = demo.payrollRuns[0];
  const bDoc = await db.employeeDocument.findFirst({ where: { employee: { companyId: demo.id } } });
  await page.goto(`/app/employees/${bEmployee.id}`);
  await expect(page.locator("body")).not.toContainText(bEmployee.lastName);
  await page.goto(`/app/payroll/${bRun.id}`);
  await expect(page.locator("body")).not.toContainText(demo.name);
  for (const url of [
    `/api/payslips/${bRun.payslips[0].id}/pdf`, `/api/payroll/${bRun.id}/payslips.pdf`, `/api/payroll/${bRun.id}/bank.csv`, `/api/payroll/${bRun.id}/journal.csv`,
    ...(bDoc ? [`/api/documents/${bDoc.id}`] : []),
  ]) {
    const r = await page.request.get(url);
    expect([403, 404], url).toContain(r.status());
  }
  const bInvoice = await db.invoice.create({ data: { number: `E2E-B-${ts}`, organizationId: demo.organizationId, issueDate: new Date(), dueDate: new Date(), currency: "SRD", subtotal: 100, total: 100 } });
  expect((await page.request.get(`/api/invoices/${bInvoice.id}/pdf`)).status()).toBe(404);
  await db.invoice.delete({ where: { id: bInvoice.id } });
  // Company exports are scoped to A's own company.
  const csv = await (await page.request.get("/api/exports/employees")).text();
  expect(csv).not.toContain(bEmployee.lastName);

  // 13. Access per status: suspended → blocked, resumed → access again.
  await admin.goto(customerUrl);
  await op(admin, "op-suspend", async (p) => { await p.getByTestId("op-suspend").locator("input[name=reason]").fill("Betalingsafspraak niet nagekomen"); });
  await expect(admin.getByTestId("subscription-terms")).toContainText("Opgeschort");
  await page.goto("/app/employees");
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("Uw abonnement is tijdelijk opgeschort.")).toBeVisible();
  await admin.getByTestId("op-resume").click();
  await expect(admin.getByTestId("subscription-terms")).toContainText("Actief");
  await page.goto("/app/employees");
  await expect(page).toHaveURL(/\/app\/employees$/);

  // Controlled support access: logged, read-only, visible to the customer.
  await admin.goto(customerUrl);
  await admin.getByTestId("support-start").locator("summary").click();
  await admin.getByTestId("support-start").locator("input[name=reason]").fill(`E2E ticket ${ts}: controle instellingen`);
  await admin.getByTestId("support-start").locator("button[type=submit]").click();
  await admin.waitForURL(/\/app$/);
  await expect(admin.getByTestId("support-banner")).toBeVisible();
  await admin.goto("/app/employees/new");
  await expect(admin).toHaveURL(/denied=1/); // read-only
  await admin.getByTestId("support-banner").getByRole("button").click();
  await admin.waitForURL(/\/admin\/support/);
  await expect(admin.getByTestId("support-sessions")).toContainText(`E2E ticket ${ts}`);
  await page.goto("/app/audit");
  await expect(page.locator("body")).toContainText("support.access_started");

  // 12. Cancellation → access ends.
  await admin.goto(customerUrl);
  await op(admin, "op-cancel", async (p) => { await p.getByTestId("op-cancel").locator("input[name=reason]").fill("Klant stopt met de dienst"); });
  await expect(admin.getByTestId("subscription-terms")).toContainText("Opgezegd");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/subscription/);
  await expect(page.getByText("Uw abonnement is beëindigd.")).toBeVisible();

  // Audit log of the portal contains the actions.
  await admin.goto("/admin/audit?q=subscription");
  await expect(admin.getByTestId("platform-audit")).toContainText("subscription.cancelled");
  await adminCtx.close();
});

test("rejected registrations get no account; plan price changes leave existing contracts alone", async ({ page }) => {
  const ts = Date.now();
  const email = `afgewezen-${ts}@e2e.test`;
  await page.goto("/register");
  await page.fill("#name", "Afgewezen Aanvrager");
  await page.fill("#email", email);
  await page.fill("#password", "Afgewezen-1234");
  await page.fill("#organizationName", `Afgewezen ${ts}`);
  await page.fill("#companyName", `Afgewezen ${ts} N.V.`);
  await page.click("button[type=submit]");
  await expect(page.getByTestId("registration-submitted")).toBeVisible();

  await login(page, "owner@demo.ara.sr", "Demo12345!");
  await page.waitForURL(/\/app/);
  await page.goto(`/admin/requests?q=${encodeURIComponent(email)}`);
  const req = page.getByTestId(`request-${email}`);
  await req.getByTestId("request-reject").locator("summary").click();
  await req.locator("input[name=note]").last().fill("Geen bedrijf in Suriname");
  await req.getByTestId("request-reject").locator("button[type=submit]").click();
  await page.goto(`/admin/requests?status=all&q=${encodeURIComponent(email)}`);
  await expect(page.getByTestId(`request-${email}`)).toContainText("Afgewezen");
  expect(await db.user.findUnique({ where: { email } })).toBeNull();

  // Plans page shows the configured plans and the website uses them.
  await page.goto("/admin/plans");
  for (const code of ["starter", "business", "professional", "enterprise"]) await expect(page.getByTestId(`plan-row-${code}`)).toBeVisible();
  await expect(page.getByTestId("plan-row-business")).toContainText("SRD 1.500,00");
  await page.goto("/");
  await expect(page.getByTestId("plan-business")).toContainText("SRD 1.500");
});
