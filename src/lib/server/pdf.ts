import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Company, Payslip, PayslipLine, PayrollRun } from "@prisma/client";
import type { Fmt } from "@/lib/format";
import type { Conversion } from "@/lib/currency";
import { conversionLabel, lineLabel } from "@/lib/payslip-labels";
import { BRAND_ICON_PNG_BASE64 } from "./brand-icon";

type Slip = Payslip & { lines: PayslipLine[] };
type T = (key: string, values?: Record<string, string | number>) => string;

const NAVY = rgb(1 / 255, 37 / 255, 88 / 255);
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
  for (const slip of slips) drawSlip(pdf.addPage([595.28, 841.89]), { font, bold, icon }, company, run, slip, t, f);
  return pdf.save();
}

function drawSlip(page: PDFPage, fonts: { font: PDFFont; bold: PDFFont; icon: PDFImage }, company: Company, run: PayrollRun, slip: Slip, t: T, f: Fmt) {
  const { font, bold, icon } = fonts;
  const { width } = page.getSize();
  const M = 48;
  const ot = { ot1: company.overtimeRate1Bp, ot2: company.overtimeRate2Bp };
  const cur = slip.calcCurrency;
  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10;
    const fnt = o.f ?? font;
    const str = safe(s);
    const xx = o.right ? x - fnt.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: xx, y: yy, size, font: fnt, color: o.color ?? rgb(0.05, 0.08, 0.14) });
  };

  page.drawRectangle({ x: 0, y: 806, width, height: 36, color: NAVY });
  page.drawImage(icon, { x: M, y: 812, width: 24, height: 24 });
  text("ARA Payroll", M + 32, 820, { size: 12, f: bold, color: rgb(1, 1, 1) });
  text(t("brand.developedBy"), width - M, 820, { size: 8, color: rgb(0.8, 0.85, 0.95), right: true });

  let y = 770;
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
  const table = (title: string, lines: PayslipLine[], total: number, totalLabel: string, x: number) => {
    let yy = y - 20;
    text(title.toUpperCase(), x, yy, { size: 8, f: bold, color: MUTED });
    yy -= 16;
    for (const l of lines) {
      const base = lineLabel(l, t, f, ot);
      const label = l.quantity != null ? `${base} x ${f.number(l.quantity, 4)}` : base;
      text(label.slice(0, 50), x, yy, { size: 9 });
      text(f.amount(l.amount), x + colW, yy, { size: 9, right: true });
      if (l.originalCurrency) {
        yy -= 11;
        text(f.money(l.originalAmount, l.originalCurrency), x + 8, yy, { size: 7.5, color: MUTED });
      }
      yy -= 14;
    }
    page.drawLine({ start: { x, y: yy + 8 }, end: { x: x + colW, y: yy + 8 }, color: LINE, thickness: 1 });
    yy -= 6;
    text(totalLabel, x, yy, { size: 10, f: bold });
    text(f.amount(total), x + colW, yy, { size: 10, f: bold, right: true });
    return yy;
  };
  const y1 = table(t("payslip.earnings"), slip.lines.filter((l) => l.type === "EARNING"), slip.grossPay, t("payslip.grossPay"), M);
  const y2 = table(t("payslip.deductions"), slip.lines.filter((l) => l.type === "DEDUCTION"), slip.totalDeductions, t("payslip.totalDeductions"), M + colW + 24);
  y = Math.min(y1, y2) - 44;

  const differs = slip.paymentCurrency !== cur;
  page.drawRectangle({ x: M, y: y - (differs ? 18 : 10), width: width - 2 * M, height: differs ? 44 : 36, color: NAVY });
  text(t("payslip.netPay").toUpperCase(), M + 14, y + 4, { size: 10, f: bold, color: rgb(1, 1, 1) });
  text(f.money(slip.netPayPayment, slip.paymentCurrency), width - M - 14, y + 2, { size: 15, f: bold, color: rgb(1, 1, 1), right: true });
  if (differs) text(`${f.money(slip.netPay, cur)} - ${t("payslip.netPaidIn", { currency: slip.paymentCurrency })}`, width - M - 14, y - 11, { size: 7.5, color: rgb(0.8, 0.85, 0.95), right: true });

  y -= differs ? 50 : 42;
  const info: [string, number][] = [[t("payslip.taxableWage"), slip.taxableWage], [t("payslip.wageTax"), slip.wageTax], [t("payslip.aov"), slip.aov]];
  for (const l of slip.lines.filter((x) => x.type === "EMPLOYER")) info.push([lineLabel(l, t, f, ot), l.amount]);
  info.forEach(([k, v], i) => {
    const x = M + i * ((width - 2 * M) / 4);
    text(k, x, y, { size: 8, color: MUTED });
    text(f.money(v, cur), x, y - 12, { size: 9, f: bold });
  });

  const conversions = (slip.conversions as unknown as Conversion[]) ?? [];
  if (conversions.length) {
    y -= 40;
    text(t("payslip.conversions").toUpperCase(), M, y, { size: 8, f: bold, color: MUTED });
    y -= 14;
    const cx = [M, M + 140, M + 240, M + 350, width - M];
    [t("payslip.convCols.item"), t("payslip.convCols.original"), t("payslip.convCols.rate"), t("payslip.convCols.rateDate"), t("payslip.convCols.converted")].forEach((h, i) => text(h, cx[i], y, { size: 7.5, color: MUTED, right: i === 4 }));
    for (const c of conversions.slice(0, 12)) {
      y -= 12;
      text(conversionLabel(c, t).slice(0, 30), cx[0], y, { size: 8 });
      text(f.money(c.originalAmount, c.from), cx[1], y, { size: 8 });
      text(`1 ${c.from} = ${f.rate(c.rate)} ${c.to}`, cx[2], y, { size: 8 });
      text(f.date(c.rateDate), cx[3], y, { size: 8 });
      text(f.money(c.convertedAmount, c.to), cx[4], y, { size: 8, right: true });
    }
  }

  const footer = t("payslip.generated");
  text(footer, width / 2 - font.widthOfTextAtSize(safe(footer), 7.5) / 2, 40, { size: 7.5, color: MUTED });
}
