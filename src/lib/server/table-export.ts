import "server-only";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { toCsv } from "./csv";

export type ExportFormat = "csv" | "xlsx" | "pdf";
export type Cell = string | number | null | undefined;
export type ExportTable = {
  title: string; subtitle?: string; header: string[]; rows: Cell[][]; filename: string;
  /** Column indexes holding money in minor units (exported as decimals, right-aligned). */
  moneyCols?: number[];
  footer?: string;
};

export const exportFormat = (req: Request): ExportFormat => {
  const f = new URL(req.url).searchParams.get("format");
  return f === "xlsx" || f === "pdf" ? f : "csv";
};

const safe = (s: string) => s.replace(/ | /g, " ").replace(/[^\x20-\x7E\xA0-\xFF€–—‘’“”•…]/g, "?");
const value = (v: Cell, money: boolean) => (v == null ? "" : money && typeof v === "number" ? v / 100 : v);
const disposition = (name: string) => `attachment; filename="${name.replace(/[^\w.\-]/g, "_")}"`;

/** One report table as CSV, Excel (.xlsx) or PDF (landscape A4, paginated). */
export async function tableResponse(tbl: ExportTable, format: ExportFormat): Promise<Response> {
  const money = new Set(tbl.moneyCols ?? []);
  const rows = tbl.rows.map((r) => r.map((v, i) => value(v, money.has(i))));
  if (format === "csv") {
    const csvRows = rows.map((r) => r.map((v, i) => (money.has(i) && typeof v === "number" ? v.toFixed(2) : v)));
    return new Response("﻿" + toCsv([tbl.header, ...csvRows]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition(`${tbl.filename}.csv`), "Cache-Control": "no-store" } });
  }
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(tbl.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
    ws.addRow([tbl.title]).font = { bold: true, size: 13 };
    if (tbl.subtitle) ws.addRow([tbl.subtitle]);
    ws.addRow([]);
    const head = ws.addRow(tbl.header);
    head.font = { bold: true };
    for (const r of rows) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v)));
    tbl.header.forEach((h, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.min(40, Math.max(10, h.length + 2, ...rows.map((r) => String(r[i] ?? "").length + 2)));
      if (money.has(i)) col.numFmt = "#,##0.00";
    });
    const buf = await wb.xlsx.writeBuffer();
    return new Response(new Uint8Array(buf as ArrayBuffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": disposition(`${tbl.filename}.xlsx`), "Cache-Control": "no-store" } });
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle(tbl.title);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 36, size = 8;
  const widths = tbl.header.map((h, i) => Math.max(font.widthOfTextAtSize(safe(h), size), ...rows.slice(0, 200).map((r) => font.widthOfTextAtSize(safe(fmt(r[i], money.has(i))), size))) + 10);
  const scale = Math.min(1, (W - 2 * M) / widths.reduce((a, b) => a + b, 0));
  const cw = widths.map((w) => w * scale);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const header = (first: boolean) => {
    if (first) {
      page.drawText(safe(tbl.title), { x: M, y, size: 13, font: bold, color: rgb(11 / 255, 61 / 255, 145 / 255) }); y -= 16;
      if (tbl.subtitle) { page.drawText(safe(tbl.subtitle), { x: M, y, size: 9, font, color: rgb(0.36, 0.4, 0.48) }); y -= 16; }
    }
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 14, color: rgb(0.94, 0.95, 0.97) });
    let x = M;
    tbl.header.forEach((h, i) => { cell(h, x, cw[i], money.has(i), bold); x += cw[i]; });
    y -= 16;
  };
  function cell(text: string, x: number, w: number, right: boolean, f = font) {
    let s = safe(text);
    while (s.length > 1 && f.widthOfTextAtSize(s, size * scale + 0.5) > w - 4) s = s.slice(0, -2) + "…";
    const tw = f.widthOfTextAtSize(s, size * scale + 0.5);
    page.drawText(s, { x: right ? x + w - 3 - tw : x + 3, y, size: size * scale + 0.5, font: f });
  }
  header(true);
  for (const r of rows) {
    if (y < M + 20) { page = pdf.addPage([W, H]); y = H - M; header(false); }
    let x = M;
    r.forEach((v, i) => { cell(fmt(v, money.has(i)), x, cw[i], money.has(i) || typeof v === "number"); x += cw[i]; });
    y -= 12;
  }
  if (tbl.footer) page.drawText(safe(tbl.footer), { x: M, y: M - 14, size: 7, font, color: rgb(0.36, 0.4, 0.48) });
  return new Response(new Uint8Array(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition(`${tbl.filename}.pdf`), "Cache-Control": "no-store" } });
}

function fmt(v: Cell, money: boolean) {
  if (v == null) return "";
  if (typeof v === "number") return money ? v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
  return v;
}
