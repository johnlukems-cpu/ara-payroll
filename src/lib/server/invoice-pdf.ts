import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Invoice, Organization, Payment } from "@prisma/client";
import type { Fmt } from "@/lib/format";
import { BRAND_ICON_PNG_BASE64 } from "./brand-icon";
import type { SaasSettings } from "./saas";

type T = (key: string, values?: Record<string, string | number>) => string;
type Line = { description?: string; quantity?: number; unitPrice?: number; amount?: number };

const NAVY = rgb(11 / 255, 61 / 255, 145 / 255);
const MUTED = rgb(0.36, 0.4, 0.48);
const LINE = rgb(0.88, 0.9, 0.93);
const INK = rgb(0.05, 0.08, 0.14);
const safe = (s: string | null | undefined) => (s ?? "").replace(/ | /g, " ").replace(/[^\x20-\x7E\xA0-\xFF€–—‘’“”•…]/g, "?");

/**
 * Invoice / credit note PDF of ARA Intelligent Solutions to a customer. The seller block and payment
 * instructions come from the platform settings entered by the super administrator; nothing is invented.
 */
export async function renderInvoicePdf(inv: Invoice & { organization: Organization; payments: Payment[] }, settings: SaasSettings, t: T, f: Fmt) {
  const pdf = await PDFDocument.create();
  const credit = inv.kind === "CREDIT_NOTE";
  const title = t(credit ? "saas.billing.creditNote" : "saas.billing.invoice");
  pdf.setTitle(`${title} ${inv.number}`);
  pdf.setAuthor(t("brand.company"));
  pdf.setCreator(t("brand.product"));
  pdf.setLanguage(f.tag);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const icon = await pdf.embedPng(Buffer.from(BRAND_ICON_PNG_BASE64, "base64"));
  const page = pdf.addPage([595.28, 841.89]);
  const { width } = page.getSize();
  const M = 48;
  const text = (s: string, x: number, y: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10;
    const fnt = o.f ?? font;
    const str = safe(s);
    page.drawText(str, { x: o.right ? x - fnt.widthOfTextAtSize(str, size) : x, y, size, font: fnt, color: o.color ?? INK });
  };
  const money = (v: number) => f.money(v, inv.currency);

  page.drawRectangle({ x: 0, y: 806, width, height: 36, color: NAVY });
  page.drawImage(icon, { x: M, y: 812, width: 24, height: 24 });
  text("ARA Payroll", M + 32, 820, { size: 12, f: bold, color: rgb(1, 1, 1) });
  text(t("brand.developedBy"), width - M, 820, { size: 8, color: rgb(0.8, 0.85, 0.95), right: true });

  // Seller (left) and document data (right).
  let y = 770;
  text(t("brand.company"), M, y, { size: 13, f: bold });
  text(title.toUpperCase(), width - M, y, { size: 14, f: bold, color: NAVY, right: true });
  let ys = y - 15;
  for (const l of settings.sellerDetails.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6)) { text(l, M, ys, { size: 9, color: MUTED }); ys -= 12; }
  let yr = y - 18;
  const meta: [string, string][] = [
    [t("saas.billing.number"), inv.number],
    [t("saas.billing.issueDate"), f.date(inv.issueDate)],
    ...(!credit ? [[t("saas.billing.dueDate"), f.date(inv.dueDate)] as [string, string]] : []),
    ...(inv.periodStart && inv.periodEnd ? [[t("saas.billing.period"), `${f.date(inv.periodStart)} – ${f.date(inv.periodEnd)}`] as [string, string]] : []),
  ];
  for (const [k, v] of meta) { text(k, width - M - 150, yr, { size: 9, color: MUTED }); text(v, width - M, yr, { size: 9, f: bold, right: true }); yr -= 13; }

  // Customer.
  y = Math.min(ys, yr) - 20;
  text(t("saas.billing.billTo"), M, y, { size: 8, color: MUTED });
  y -= 14;
  const o = inv.organization;
  for (const l of [o.name, o.contactName, o.address, o.country, o.registrationNumber ? t("saas.billing.kkf", { value: o.registrationNumber }) : null, o.contactEmail].filter(Boolean) as string[]) {
    text(l, M, y, { size: l === o.name ? 11 : 9, f: l === o.name ? bold : font }); y -= 13;
  }

  // Lines.
  y -= 16;
  page.drawRectangle({ x: M, y: y - 6, width: width - 2 * M, height: 20, color: rgb(0.95, 0.96, 0.98) });
  text(t("saas.billing.description"), M + 6, y, { size: 8, f: bold, color: MUTED });
  text(t("saas.billing.quantity"), width - M - 170, y, { size: 8, f: bold, color: MUTED, right: true });
  text(t("saas.billing.unitPrice"), width - M - 90, y, { size: 8, f: bold, color: MUTED, right: true });
  text(t("saas.billing.amount"), width - M - 6, y, { size: 8, f: bold, color: MUTED, right: true });
  y -= 22;
  const lines = (Array.isArray(inv.lines) ? inv.lines : []) as Line[];
  for (const l of lines) {
    const desc = safe(l.description ?? "");
    const max = width - 2 * M - 200;
    let row = "";
    const wrapped: string[] = [];
    for (const w of desc.split(" ")) { const next = row ? `${row} ${w}` : w; if (font.widthOfTextAtSize(next, 9.5) > max && row) { wrapped.push(row); row = w; } else row = next; }
    if (row) wrapped.push(row);
    text(String(l.quantity ?? 1), width - M - 170, y, { size: 9.5, right: true });
    text(money(l.unitPrice ?? 0), width - M - 90, y, { size: 9.5, right: true });
    text(money(l.amount ?? 0), width - M - 6, y, { size: 9.5, right: true });
    for (const w of wrapped) { text(w, M + 6, y, { size: 9.5 }); y -= 13; }
    y -= 4;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: width - M, y: y + 6 }, color: LINE, thickness: 0.8 });
  }

  // Totals.
  y -= 10;
  const totals: [string, string, boolean][] = [
    [t("saas.billing.subtotal"), money(inv.subtotal), false],
    ...(inv.discount ? [[t("saas.billing.discount"), money(-inv.discount), false] as [string, string, boolean]] : []),
    [t("saas.billing.total"), money(inv.total), true],
    ...(!credit ? [[t("saas.billing.paid"), money(inv.amountPaid), false] as [string, string, boolean], [t("saas.billing.outstanding"), money(Math.max(0, inv.total - inv.amountPaid)), true] as [string, string, boolean]] : []),
  ];
  for (const [k, v, b] of totals) { text(k, width - M - 200, y, { size: 10, f: b ? bold : font }); text(v, width - M - 6, y, { size: 10, f: b ? bold : font, right: true }); y -= 15; }

  if (!credit && inv.payments.length) {
    y -= 10;
    text(t("saas.billing.paymentHistory"), M, y, { size: 9, f: bold }); y -= 13;
    for (const p of inv.payments) { text(`${f.date(p.paidAt)} · ${p.reference ?? p.methodCode}`, M, y, { size: 9, color: MUTED }); text(f.money(p.amount, p.currency), width - M - 6, y, { size: 9, right: true }); y -= 12; }
  }
  if (inv.notes) { y -= 12; text(inv.notes, M, y, { size: 9, color: MUTED }); y -= 12; }
  if (!credit && settings.paymentInstructions) {
    y -= 16;
    text(t("saas.billing.paymentInstructions"), M, y, { size: 9, f: bold }); y -= 13;
    for (const l of settings.paymentInstructions.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6)) { text(l, M, y, { size: 9 }); y -= 12; }
  }
  const footer = t("saas.billing.pdfFooter");
  text(footer, width / 2 - font.widthOfTextAtSize(safe(footer), 7.5) / 2, 40, { size: 7.5, color: MUTED });
  return pdf.save();
}
