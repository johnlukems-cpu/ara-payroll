import "server-only";

/** RFC 4180 CSV with protection against spreadsheet formula injection. */
export function toCsv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((r) =>
      r.map((v) => {
        if (v === null || v === undefined) return "";
        let s = String(v);
        if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    )
    .join("\r\n");
}

export function csvResponse(rows: (string | number | null | undefined)[][], filename: string) {
  return new Response("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const dec = (cents: number) => (cents / 100).toFixed(2);
