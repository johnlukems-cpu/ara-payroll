import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Company, Payslip, PayslipLine, PayrollRun } from "@prisma/client";
import type { Fmt } from "@/lib/format";
import type { Conversion } from "@/lib/currency";
import { conversionLabel, lineLabel } from "@/lib/payslip-labels";
import { BRAND_ICON_PNG_BASE64 } from "./brand-icon";
import { payslipSummary, SUMMARY_ROWS } from "@/lib/payroll/summary";

type Slip = Payslip & { lines: PayslipLine[] };
type T = (key: string, values?: Record<string, string | number>) => string;

const NAVY = rgb(11 / 255, 61 / 255, 145 / 255);
const MUTED = rgb(0.36, 0.4, 0.48);
const LINE = rgb(0.88, 0.9, 0.93);

// Standard PDF fonts only support WinAnsi; strip anything outside it.
const safe = (s: string | null | undefined) => (s ?? "").replace(/ | /g, " ").replace(/[^\x20-\x7E\xA0-\xFF€]/g, "?");

export async function renderPayslipsPdf(company: Company, run: PayrollRun, slips: Slip[], t: T, f: Fmt) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${t("payslip.title")} ${f.period(run.year, run.month)} - ${company.name}`);
  pdf.setAuthor(t("brand.company"));
  pdf.setProducer(`${t("brand.product")} - ${t("brand.company")}`);
  pdf.setCreator(t("brand.product"));
  pdf.setLanguage(f.tag);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const icon = await pdf.embedPng(Buffer.from(BRAND_ICON_PNG_BASE64, "base64"));
  for (const slip of slips) drawSlip(() => pdf.addPage([595.28, 841.89]), { font, bold, icon }, company, run, slip, t, f);
  return pdf.save();
}

function drawSlip(addPage: () => PDFPage, fonts: { font: PDFFont; bold: PDFFont; icon: PDFImage }, company: Company, run: PayrollRun, slip: Slip, t: T, f: Fmt) {
  const { font, bold, icon } = fonts;
  let page = addPage();
  const { width } = page.getSize();
  const M = 48;
  let y = 0;
  const ot = { ot1: company.overtimeRate1Bp, ot2: company.overtimeRate2Bp };
  const cur = slip.calcCurrency;
  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10;
    const fnt = o.f ?? font;
    const str = safe(s);
    const xx = o.right ? x - fnt.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: xx, y: yy, size, font: fnt, color: o.color ?? rgb(0.05, 0.08, 0.14) });
  };

  const BOTTOM = 64; // keep clear of the footer
  const footer = t("payslip.generated");
  const drawFooter = () => text(footer, width / 2 - font.widthOfTextAtSize(safe(footer), 7.5) / 2, 40, { size: 7.5, color: MUTED });
  /** Starts a continuation page when the next block does not fit, so content never overlaps the footer or falls off the page. */
  const ensure = (needed: number) => {
    if (y - needed >= BOTTOM) return;
    drawFooter();
    page = addPage();
    page.drawRectangle({ x: 0, y: 806, width, height: 36, color: NAVY });
    text(`${slip.employeeName} - ${f.period(run.year, run.month)} (${t("payslip.continued")})`, M, 820, { size: 10, f: bold, color: rgb(1, 1, 1) });
    y = 780;
  };

  page.drawRectangle({ x: 0, y: 806, width, height: 36, color: NAVY });
  page.drawImage(icon, { x: M, y: 812, width: 24, height: 24 });
  text("ARA Payroll", M + 32, 820, { size: 12, f: bold, color: rgb(1, 1, 1) });
  text(t("brand.developedBy"), width - M, 820, { size: 8, color: rgb(0.8, 0.85, 0.95), right: true });

  y = 770;
  text(company.legalName ?? company.name, M, y, { size: 14, f: bold });
  text(t("payslip.title").toUpperCase(), width - M, y, { size: 9, color: MUTED, right: true });
  y -= 16;
  text([company.address, company.district].filter(Boolean).join(", "), M, y, { size: 9, color: MUTED });
  text(f.period(run.year, run.month), width - M, y, { size: 13, f: bold, right: true });
  y -= 13;
  if (company.taxNumber) text(`${t("payslip.taxNo", { value: company.taxNumber })}${company.kkfNumber ? `  ${t("payslip.kkf", { value: company.kkfNumber })}` : ""}`, M, y, { size: 8, color: MUTED });
  text(t("payslip.payDate", { date: f.date(run.payDate) }), width - M, y, { size: 9, color: MUTED, right: true });

  y -= 22;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, color: LINE, thickness: 1 });
  y -= 18;
  const cols = [[t("payslip.employee"), slip.employeeName], [t("payslip.employeeNo"), slip.employeeNumber], [t("payslip.position"), slip.jobTitle ?? "-"], [t("payslip.bankAccount"), slip.bankAccount ?? "-"]];
  cols.forEach(([k, v], i) => {
    const x = M + i * ((width - 2 * M) / 4);
    text(k, x, y, { size: 8, color: MUTED });
    text(v, x, y - 13, { size: 10, f: bold });
  });
  y -= 36;
  page.drawLine({ start: { x: M, y }, end: { x: width - M, y }, color: LINE, thickness: 1 });
  y -= 14;
  text(t("payslip.calcIn", { currency: cur }), M, y, { size: 8, color: MUTED });

  const colW = (width - 2 * M - 24) / 2;
  const xL = M;
  const xR = M + colW + 24;
  const earnings = slip.lines.filter((l) => l.type === "EARNING");
  const deductionLines = slip.lines.filter((l) => l.type === "DEDUCTION");
  const rowHeight = (l?: PayslipLine) => (l ? (l.originalCurrency ? 25 : 14) : 0);
  const cell = (l: PayslipLine, x: number, yy: number) => {
    const base = lineLabel(l, t, f, ot);
    const label = l.quantity != null ? `${base} x ${f.number(l.quantity, 4)}` : base;
    text(label.slice(0, 50), x, yy, { size: 9 });
    text(f.amount(l.amount), x + colW, yy, { size: 9, right: true });
    if (l.originalCurrency) text(f.money(l.originalAmount, l.originalCurrency), x + 8, yy - 11, { size: 7.5, color: MUTED });
  };
  const heads = () => {
    text(t("payslip.earnings").toUpperCase(), xL, y, { size: 8, f: bold, color: MUTED });
    text(t("payslip.deductions").toUpperCase(), xR, y, { size: 8, f: bold, color: MUTED });
    y -= 16;
  };
  y -= 20;
  heads();
  // Both columns are drawn row by row so a long payslip continues on the next page.
  for (let i = 0; i < Math.max(earnings.length, deductionLines.length); i++) {
    const h = Math.max(rowHeight(earnings[i]), rowHeight(deductionLines[i]));
    if (y - h < BOTTOM) { ensure(h + 16); heads(); }
    if (earnings[i]) cell(earnings[i], xL, y);
    if (deductionLines[i]) cell(deductionLines[i], xR, y);
    y -= h;
  }
  ensure(24);
  page.drawLine({ start: { x: xL, y: y + 8 }, end: { x: xL + colW, y: y + 8 }, color: LINE, thickness: 1 });
  page.drawLine({ start: { x: xR, y: y + 8 }, end: { x: xR + colW, y: y + 8 }, color: LINE, thickness: 1 });
  y -= 6;
  text(t("payslip.grossPay"), xL, y, { size: 10, f: bold });
  text(f.amount(slip.grossPay), xL + colW, y, { size: 10, f: bold, right: true });
  text(t("payslip.totalDeductions"), xR, y, { size: 10, f: bold });
  text(f.amount(slip.totalDeductions), xR + colW, y, { size: 10, f: bold, right: true });
  y -= 44;
  ensure(40);

  const differs = slip.paymentCurrency !== cur;
  page.drawRectangle({ x: M, y: y - (differs ? 18 : 10), width: width - 2 * M, height: differs ? 44 : 36, color: NAVY });
  text(t("payslip.netPay").toUpperCase(), M + 14, y + 4, { size: 10, f: bold, color: rgb(1, 1, 1) });
  text(f.money(slip.netPayPayment, slip.paymentCurrency), width - M - 14, y + 2, { size: 15, f: bold, color: rgb(1, 1, 1), right: true });
  if (differs) text(`${f.money(slip.netPay, cur)} - ${t("payslip.netPaidIn", { currency: slip.paymentCurrency })}`, width - M - 14, y - 11, { size: 7.5, color: rgb(0.8, 0.85, 0.95), right: true });

  // Summary: the 12 payslip totals in two columns.
  y -= differs ? 46 : 38;
  ensure(14 + 6 * 13 + 30);
  text(t("payslip.summaryTitle").toUpperCase(), M, y, { size: 8, f: bold, color: MUTED });
  const summary = payslipSummary(slip, slip.lines);
  const strong = new Set(["grossPay", "totalDeductions", "totalPayable"]);
  SUMMARY_ROWS.forEach((k, i) => {
    const x = i < 6 ? M : M + colW + 24;
    const yy = y - 14 - (i % 6) * 13;
    const o = strong.has(k) ? { size: 9, f: bold } : { size: 9 };
    text(t(`payslip.summary.${k}`), x, yy, o);
    text(f.money(summary[k], cur), x + colW, yy, { ...o, right: true });
  });
  y -= 14 + 6 * 13 + 4;
  const employer = slip.lines.filter((x) => x.type === "EMPLOYER");
  if (employer.length) {
    y -= 10;
    ensure(24);
    employer.slice(0, 4).forEach((l, i) => {
      const x = M + i * ((width - 2 * M) / 4);
      text(lineLabel(l, t, f, ot).slice(0, 34), x, y, { size: 7.5, color: MUTED });
      text(f.money(l.amount, cur), x, y - 11, { size: 8.5, f: bold });
    });
    y -= 12;
  }

  const conversions = (slip.conversions as unknown as Conversion[]) ?? [];
  if (conversions.length) {
    y -= 40;
    ensure(40);
    text(t("payslip.conversions").toUpperCase(), M, y, { size: 8, f: bold, color: MUTED });
    y -= 14;
    const cx = [M, M + 140, M + 240, M + 350, width - M];
    [t("payslip.convCols.item"), t("payslip.convCols.original"), t("payslip.convCols.rate"), t("payslip.convCols.rateDate"), t("payslip.convCols.converted")].forEach((h, i) => text(h, cx[i], y, { size: 7.5, color: MUTED, right: i === 4 }));
    for (const c of conversions) {
      y -= 12;
      ensure(0);
      text(conversionLabel(c, t).slice(0, 30), cx[0], y, { size: 8 });
      text(f.money(c.originalAmount, c.from), cx[1], y, { size: 8 });
      text(`1 ${c.from} = ${f.rate(c.rate)} ${c.to}`, cx[2], y, { size: 8 });
      text(f.date(c.rateDate), cx[3], y, { size: 8 });
      text(f.money(c.convertedAmount, c.to), cx[4], y, { size: 8, right: true });
    }
  }

  drawFooter();
}
