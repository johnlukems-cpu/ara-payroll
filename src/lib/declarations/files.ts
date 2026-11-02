/**
 * Declaration file generation (PDF, Excel, CSV). Pure: takes a snapshot, a translator and a formatter.
 * Files contain the figures from the immutable snapshot only.
 */
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Fmt } from "@/lib/format";
import type { DeclarationSnapshot } from "./aggregate";

type T = (key: string, values?: Record<string, string | number>) => string;
export type FileKind = "PAYROLL_TAX" | "AOV" | "EMPLOYEE_SCHEDULE" | "PAYROLL_SUMMARY";
export type FileFormat = "PDF" | "XLSX" | "CSV";
export type GeneratedFile = { kind: FileKind; format: FileFormat; fileName: string; mimeType: string; content: Buffer };

export type DeclarationMeta = {
  type: "LB_AOV_MONTHLY" | "VERZAMELLOONSTAAT";
  version: number;
  deadline: Date;
  previousAdjustments: number;
  totalPayable: number;
  status: string;
  legalPending: boolean;
};

const PREFIX: Record<FileKind, string> = { PAYROLL_TAX: "PayrollTax", AOV: "AOV", EMPLOYEE_SCHEDULE: "EmployeeSchedule", PAYROLL_SUMMARY: "PayrollSummary" };
const MIME: Record<FileFormat, string> = {
  PDF: "application/pdf",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv; charset=utf-8",
};

/** Consistent file names, e.g. ARA_PayrollTax_CompanyName_2026-10.pdf (supplementary: _v2). */
export function declarationFileName(kind: FileKind, company: string, period: { year: number; month: number }, version: number, format: FileFormat) {
  const safe = company.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "").slice(0, 60) || "Company";
  const p = period.month ? `${period.year}-${String(period.month).padStart(2, "0")}` : String(period.year);
  return `ARA_${PREFIX[kind]}_${safe}_${p}${version > 1 ? `_v${version}` : ""}.${format.toLowerCase()}`;
}

const dec = (v: number) => (v / 100).toFixed(2);

function csv(rows: (string | number | null | undefined)[][]) {
  const body = rows.map((r) => r.map((v) => {
    if (v == null) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
  return Buffer.from("﻿" + body, "utf8");
}

function headerRows(s: DeclarationSnapshot, m: DeclarationMeta, t: T, f: Fmt) {
  return [
    [t("decl.file.company"), s.company.legalName ?? s.company.name],
    [t("decl.file.kkf"), s.company.kkfNumber ?? ""],
    [t("decl.file.taxNumber"), s.company.taxNumber ?? ""],
    [t("decl.file.address"), [s.company.address, s.company.district].filter(Boolean).join(", ")],
    [t("decl.file.period"), s.period.month ? f.period(s.period.year, s.period.month) : String(s.period.year)],
    [t("decl.file.currency"), s.currency],
    [t("decl.file.version"), m.version > 1 ? t("decl.file.supplementary", { version: m.version }) : "1"],
    [t("decl.file.deadline"), f.date(m.deadline)],
    [t("decl.file.status"), t(`decl.status.${m.status}`)],
  ];
}

function taxSummaryRows(s: DeclarationSnapshot, m: DeclarationMeta, t: T): [string, number][] {
  return [
    [t("decl.file.employees"), s.totals.employeeCount],
    [t("decl.file.gross"), s.totals.gross],
    [t("decl.file.taxable"), s.totals.taxable],
    [t("decl.file.wageTaxRegular"), s.totals.wageTaxRegular],
    [t("decl.file.wageTaxSpecial"), s.totals.wageTaxSpecial],
    [t("decl.file.wageTaxOvertime"), s.totals.wageTaxOvertime],
    [t("decl.file.wageTax"), s.totals.wageTax],
    [t("decl.file.aov"), s.totals.aov + s.totals.aovEmployer],
    [t("decl.file.previousAdjustments"), m.previousAdjustments],
    [t("decl.file.totalPayable"), m.totalPayable],
  ];
}

async function xlsx(build: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ARA Payroll — ARA Intelligent Solutions";
  wb.created = new Date();
  build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const money = (ws: ExcelJS.Worksheet, cols: number[]) => cols.forEach((c) => (ws.getColumn(c).numFmt = "#,##0.00"));

const NAVY = rgb(11 / 255, 61 / 255, 145 / 255);
const MUTED = rgb(0.36, 0.4, 0.48);
const safeText = (s: string) => s.replace(/ | /g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, "?");

async function pdf(title: string, s: DeclarationSnapshot, m: DeclarationMeta, t: T, f: Fmt, body: (ctx: { page: PDFPage; text: Txt; y: number; addPage: () => PDFPage }) => void) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor("ARA Intelligent Solutions");
  doc.setCreator("ARA Payroll");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  const W = 595.28;
  const M = 48;
  const text: Txt = (str, x, y, o = {}) => {
    const size = o.size ?? 9;
    const fnt = o.bold ? bold : font;
    const v = safeText(str);
    page.drawText(v, { x: o.right ? x - fnt.widthOfTextAtSize(v, size) : x, y, size, font: fnt, color: o.color ?? rgb(0.05, 0.08, 0.14) });
  };
  const header = () => {
    page.drawRectangle({ x: 0, y: 806, width: W, height: 36, color: NAVY });
    text("ARA Payroll", M, 820, { size: 12, bold: true, color: rgb(1, 1, 1) });
    text(t("brand.developedBy"), W - M, 820, { size: 8, color: rgb(0.85, 0.9, 1), right: true });
  };
  header();
  let y = 770;
  text(title, M, y, { size: 15, bold: true });
  y -= 22;
  if (m.legalPending) {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 20, color: rgb(1, 0.95, 0.85) });
    text(t("decl.file.legalPending"), M + 8, y, { size: 8.5, color: rgb(0.55, 0.35, 0) });
    y -= 26;
  }
  for (const [k, v] of headerRows(s, m, t, f)) {
    text(k, M, y, { color: MUTED });
    text(String(v), M + 150, y, { bold: true });
    y -= 13;
  }
  y -= 10;
  const addPage = () => {
    page = doc.addPage([595.28, 841.89]);
    header();
    return page;
  };
  body({ page, text: (...a) => text(...a), y, addPage });
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    text(`${t("decl.file.generated", { date: f.dateTime(new Date()) })} · ${i + 1}/${pages.length}`, M, 30, { size: 7, color: MUTED });
    text(t("decl.file.notSubmitted"), W - M, 30, { size: 7, color: MUTED, right: true });
  });
  return Buffer.from(await doc.save());
}

type Txt = (s: string, x: number, y: number, o?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; right?: boolean }) => void;

/** Draws a table with automatic page breaks; returns the y after the table. */
function table(ctx: { text: Txt; addPage: () => PDFPage }, y: number, cols: { label: string; x: number; right?: boolean }[], rows: string[][], font?: PDFFont) {
  void font;
  const head = () => {
    cols.forEach((c) => ctx.text(c.label, c.x, y, { size: 7.5, bold: true, right: c.right }));
    y -= 12;
  };
  head();
  for (const r of rows) {
    if (y < 60) {
      ctx.addPage();
      y = 780;
      head();
    }
    r.forEach((v, i) => ctx.text(v.slice(0, 34), cols[i].x, y, { size: 7.5, right: cols[i].right }));
    y -= 11;
  }
  return y;
}

export async function generateDeclarationFiles(s: DeclarationSnapshot, m: DeclarationMeta, t: T, f: Fmt): Promise<GeneratedFile[]> {
  const name = s.company.name;
  const fn = (kind: FileKind, fmt: FileFormat) => declarationFileName(kind, name, s.period, m.version, fmt);
  const out: GeneratedFile[] = [];
  const push = (kind: FileKind, format: FileFormat, content: Buffer) => out.push({ kind, format, fileName: fn(kind, format), mimeType: MIME[format], content });
  const title = m.type === "VERZAMELLOONSTAAT" ? t("decl.file.titleAnnual") : t("decl.file.titleTax");

  // Payroll tax declaration (the official monthly return combines loonbelasting and AOV premium)
  const summary = taxSummaryRows(s, m, t);
  push("PAYROLL_TAX", "PDF", await pdf(title, s, m, t, f, (ctx) => {
    let y = ctx.y;
    ctx.text(t("decl.file.summary"), 48, y, { size: 11, bold: true });
    y -= 16;
    for (const [k, v] of summary) {
      ctx.text(k, 48, y);
      ctx.text(k === t("decl.file.employees") ? String(v) : f.money(v, s.currency), 547, y, { right: true, bold: k === t("decl.file.totalPayable") });
      y -= 13;
    }
    y -= 10;
    ctx.text(t("decl.file.ruleSets", { tax: s.ruleSets.tax.join(", ") || "—", aov: s.ruleSets.aov.join(", ") || "—" }), 48, y, { size: 7.5, color: MUTED });
    y -= 22;
    ctx.text(t("decl.file.schedule"), 48, y, { size: 11, bold: true });
    y -= 16;
    table(ctx, y, [
      { label: t("decl.file.colNumber"), x: 48 }, { label: t("decl.file.colName"), x: 95 }, { label: t("decl.file.colTaxable"), x: 330, right: true },
      { label: t("decl.file.colWageTax"), x: 420, right: true }, { label: t("decl.file.colAov"), x: 490, right: true }, { label: t("decl.file.colTotal"), x: 547, right: true },
    ], s.employees.map((e) => [e.number, e.name, f.amount(e.taxable), f.amount(e.wageTax), f.amount(e.aov + e.aovEmployer), f.amount(e.wageTax + e.aov + e.aovEmployer)]));
  }));
  push("PAYROLL_TAX", "XLSX", await xlsx((wb) => {
    const ws = wb.addWorksheet(t("decl.file.sheetDeclaration"));
    ws.columns = [{ width: 38 }, { width: 28 }];
    headerRows(s, m, t, f).forEach((r) => ws.addRow(r));
    ws.addRow([]);
    summary.forEach(([k, v], i) => ws.addRow([k, i === 0 ? v : v / 100]));
    ws.getColumn(2).alignment = { horizontal: "right" };
    if (m.legalPending) ws.addRow([t("decl.file.legalPending")]);
    const es = wb.addWorksheet(t("decl.file.sheetEmployees"));
    es.addRow([t("decl.file.colNumber"), t("decl.file.colName"), t("decl.file.colIdNumber"), t("decl.file.colTaxable"), t("decl.file.wageTaxRegular"), t("decl.file.wageTaxSpecial"), t("decl.file.wageTaxOvertime"), t("decl.file.colWageTax")]).font = { bold: true };
    s.employees.forEach((e) => es.addRow([e.number, e.name, e.idNumber ?? "", e.taxable / 100, e.wageTaxRegular / 100, e.wageTaxSpecial / 100, e.wageTaxOvertime / 100, e.wageTax / 100]));
    es.addRow([t("decl.file.total"), "", "", s.totals.taxable / 100, s.totals.wageTaxRegular / 100, s.totals.wageTaxSpecial / 100, s.totals.wageTaxOvertime / 100, s.totals.wageTax / 100]).font = { bold: true };
    money(es, [4, 5, 6, 7, 8]);
    es.columns.forEach((c, i) => (c.width = i === 1 ? 30 : 16));
  }));
  push("PAYROLL_TAX", "CSV", csv([...headerRows(s, m, t, f), [], ...summary.map(([k, v], i) => [k, i === 0 ? v : dec(v)])]));

  // AOV report (kept as a separate report; the official return is combined with loonbelasting)
  const aovTitle = t("decl.file.titleAov");
  const aovRows = s.employees.map((e) => [e.number, e.name, e.idNumber ?? "", e.aovBase, e.aov, e.aovEmployer] as const);
  push("AOV", "PDF", await pdf(aovTitle, s, m, t, f, (ctx) => {
    let y = ctx.y;
    ctx.text(t("decl.file.aovTotals", { base: f.money(s.totals.aovBase, s.currency), employee: f.money(s.totals.aov, s.currency), employer: f.money(s.totals.aovEmployer, s.currency) }), 48, y, { bold: true });
    y -= 20;
    table(ctx, y, [
      { label: t("decl.file.colNumber"), x: 48 }, { label: t("decl.file.colName"), x: 95 }, { label: t("decl.file.colIdNumber"), x: 270 },
      { label: t("decl.file.colAovBase"), x: 420, right: true }, { label: t("decl.file.colAov"), x: 480, right: true }, { label: t("decl.file.colAovEmployer"), x: 547, right: true },
    ], aovRows.map((r) => [r[0], r[1], r[2], f.amount(r[3]), f.amount(r[4]), f.amount(r[5])]));
  }));
  const aovHeader = [t("decl.file.colNumber"), t("decl.file.colName"), t("decl.file.colIdNumber"), t("decl.file.colAovBase"), t("decl.file.colAov"), t("decl.file.colAovEmployer")];
  push("AOV", "XLSX", await xlsx((wb) => {
    const ws = wb.addWorksheet(t("decl.file.sheetAov"));
    headerRows(s, m, t, f).forEach((r) => ws.addRow(r));
    ws.addRow([]);
    ws.addRow(aovHeader).font = { bold: true };
    aovRows.forEach((r) => ws.addRow([r[0], r[1], r[2], r[3] / 100, r[4] / 100, r[5] / 100]));
    ws.addRow([t("decl.file.total"), "", "", s.totals.aovBase / 100, s.totals.aov / 100, s.totals.aovEmployer / 100]).font = { bold: true };
    money(ws, [4, 5, 6]);
    ws.columns.forEach((c, i) => (c.width = i === 1 ? 30 : 18));
  }));
  push("AOV", "CSV", csv([...headerRows(s, m, t, f), [], aovHeader, ...aovRows.map((r) => [r[0], r[1], r[2], dec(r[3]), dec(r[4]), dec(r[5])]), [t("decl.file.total"), "", "", dec(s.totals.aovBase), dec(s.totals.aov), dec(s.totals.aovEmployer)]]));

  // Supporting employee schedule
  const schedHeader = [t("decl.file.colNumber"), t("decl.file.colName"), t("decl.file.colIdNumber"), t("decl.file.colMonths"), t("decl.file.gross"), t("decl.file.colTaxable"), t("decl.file.colWageTax"), t("decl.file.colAovBase"), t("decl.file.colAov"), t("decl.file.colAovEmployer")];
  const schedRows = s.employees.map((e) => [e.number, e.name, e.idNumber ?? "", e.months, e.gross, e.taxable, e.wageTax, e.aovBase, e.aov, e.aovEmployer] as const);
  push("EMPLOYEE_SCHEDULE", "XLSX", await xlsx((wb) => {
    const ws = wb.addWorksheet(t("decl.file.sheetSchedule"));
    ws.addRow(schedHeader).font = { bold: true };
    schedRows.forEach((r) => ws.addRow([r[0], r[1], r[2], r[3], ...r.slice(4).map((v) => (v as number) / 100)]));
    money(ws, [5, 6, 7, 8, 9, 10]);
    ws.columns.forEach((c, i) => (c.width = i === 1 ? 30 : 15));
  }));
  push("EMPLOYEE_SCHEDULE", "CSV", csv([schedHeader, ...schedRows.map((r) => [r[0], r[1], r[2], r[3], ...r.slice(4).map((v) => dec(v as number))])]));

  // Payroll summary
  push("PAYROLL_SUMMARY", "CSV", csv([...headerRows(s, m, t, f), [], [t("decl.file.summary"), ""], ...summary.map(([k, v], i) => [k, i === 0 ? v : dec(v)])]));
  return out;
}
