import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { allowedActions, monthlyDeadline, nextStatus } from "@/lib/declarations/status";
import { aggregateDeclaration, payable, type SlipForDeclaration } from "@/lib/declarations/aggregate";
import { declarationFileName, generateDeclarationFiles } from "@/lib/declarations/files";
import { createFormat } from "@/lib/format";

const company = { name: "Paramaribo Trading N.V.", legalName: "Paramaribo Trading N.V.", kkfNumber: "45123", taxNumber: "1000123456", address: "Domineestraat 12", district: "Paramaribo" };
const slip = (o: Partial<SlipForDeclaration>): SlipForDeclaration => ({
  employeeId: "e1", employeeNumber: "1001", employeeName: "A", idNumber: "FB1", month: 10, runId: "r1", calcCurrency: "SRD",
  grossPay: 1_500_000, taxableWage: 1_460_000, wageTax: 65_800, aov: 58_400, aovEmployer: 0, aovBaseAmount: 1_460_000, legalStatus: "PENDING_LEGAL_VALIDATION",
  lines: [{ code: "LB", amount: 60_000 }, { code: "LB-OT", amount: 5_800 }], taxRuleSet: "SB 2024", aovRuleSet: "AOV", ...o,
});

describe("declaration status machine", () => {
  it("follows the review → approval → download → manual submission flow", () => {
    expect(nextStatus("CALCULATED", "submitForReview")).toBe("UNDER_REVIEW");
    expect(nextStatus("UNDER_REVIEW", "approve")).toBe("APPROVED");
    expect(nextStatus("APPROVED", "generate")).toBe("READY_FOR_DOWNLOAD");
    expect(nextStatus("READY_FOR_DOWNLOAD", "download")).toBe("DOWNLOADED");
    expect(nextStatus("DOWNLOADED", "recordSubmission")).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "recordAccepted")).toBe("ACCEPTED");
    expect(nextStatus("ACCEPTED", "recordPayment")).toBe("PAID");
  });
  it("never marks a declaration as submitted or accepted because a file was downloaded", () => {
    expect(nextStatus("DOWNLOADED", "download")).toBe("DOWNLOADED");
    expect(nextStatus("READY_FOR_DOWNLOAD", "recordSubmission")).toBeNull();
    expect(nextStatus("DOWNLOADED", "recordAccepted")).toBeNull();
  });
  it("blocks skipping review and approval", () => {
    expect(nextStatus("CALCULATED", "approve")).toBeNull();
    expect(nextStatus("CALCULATED", "generate")).toBeNull();
    expect(allowedActions("PAID")).toEqual(["download", "createSupplementary"]);
  });
  it("computes the filing deadline in the following month", () => {
    expect(monthlyDeadline(2026, 10, 10).toISOString().slice(0, 10)).toBe("2026-11-10");
    expect(monthlyDeadline(2026, 12, 10).toISOString().slice(0, 10)).toBe("2027-01-10");
  });
});

describe("declaration aggregation", () => {
  it("totals payroll tax and AOV separately per employee and overall", () => {
    const s = aggregateDeclaration(company, { year: 2026, month: 10 }, [slip({}), slip({ employeeId: "e2", employeeNumber: "1002", aovEmployer: 1_000, lines: [{ code: "LB", amount: 65_800 }] })]);
    expect(s.totals.employeeCount).toBe(2);
    expect(s.totals.wageTax).toBe(131_600);
    expect(s.totals.wageTaxOvertime).toBe(5_800);
    expect(s.totals.aov).toBe(116_800);
    expect(s.totals.aovEmployer).toBe(1_000);
    expect(payable(s, -500)).toBe(131_600 + 116_800 + 1_000 - 500);
    expect(s.legalPending).toBe(true);
  });
  it("aggregates an annual statement per employee across months", () => {
    const s = aggregateDeclaration(company, { year: 2026, month: 0 }, [slip({ month: 1 }), slip({ month: 2 })]);
    expect(s.employees[0]).toMatchObject({ months: 2, wageTax: 131_600 });
  });
});

describe("declaration files", () => {
  const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${JSON.stringify(v)}` : k);
  const meta = { type: "LB_AOV_MONTHLY" as const, version: 1, deadline: new Date("2026-11-10"), previousAdjustments: 0, totalPayable: 124_200, status: "READY_FOR_DOWNLOAD", legalPending: true };

  it("uses the consistent file name format", () => {
    expect(declarationFileName("PAYROLL_TAX", "Paramaribo Trading N.V.", { year: 2026, month: 10 }, 1, "PDF")).toBe("ARA_PayrollTax_ParamariboTradingNV_2026-10.pdf");
    expect(declarationFileName("AOV", "Café Ñandú", { year: 2026, month: 10 }, 2, "XLSX")).toBe("ARA_AOV_CafeNandu_2026-10_v2.xlsx");
  });

  it("generates valid PDF, Excel and CSV files containing the snapshot figures", async () => {
    const s = aggregateDeclaration(company, { year: 2026, month: 10 }, [slip({})]);
    const files = await generateDeclarationFiles(s, meta, t, createFormat("nl"));
    expect(files.map((f) => `${f.kind}.${f.format}`).sort()).toEqual(["AOV.CSV", "AOV.PDF", "AOV.XLSX", "EMPLOYEE_SCHEDULE.CSV", "EMPLOYEE_SCHEDULE.XLSX", "PAYROLL_SUMMARY.CSV", "PAYROLL_TAX.CSV", "PAYROLL_TAX.PDF", "PAYROLL_TAX.XLSX"]);
    const pdf = files.find((f) => f.kind === "PAYROLL_TAX" && f.format === "PDF")!;
    expect((await PDFDocument.load(pdf.content)).getPageCount()).toBeGreaterThan(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(files.find((f) => f.kind === "AOV" && f.format === "XLSX")!.content as unknown as ArrayBuffer);
    const values = wb.worksheets[0].getSheetValues().flat().filter((v) => typeof v === "number");
    expect(values).toContain(584);
    const csvText = files.find((f) => f.kind === "PAYROLL_TAX" && f.format === "CSV")!.content.toString("utf8");
    expect(csvText).toContain("1000123456");
    expect(csvText).toContain("658.00");
  });
});
