/**
 * Fixed-date public holidays in Suriname. Movable holidays (Good Friday, Easter Monday,
 * Holi Phagwa, Eid ul-Fitr, Diwali, Chinese New Year) differ per year and should be
 * entered manually by adjusting the number of leave days.
 */
export const SR_FIXED_HOLIDAYS = [
  "01-01", // New Year's Day
  "05-01", // Labour Day
  "06-05", // Indian Arrival Day
  "07-01", // Keti Koti (Emancipation Day)
  "08-08", // Javanese Arrival Day
  "08-09", // Day of the Indigenous Peoples
  "10-10", // Day of the Maroons
  "10-20", // Chinese Arrival Day
  "11-25", // Independence Day
  "12-25", // Christmas Day
  "12-26", // Boxing Day
];

/** Counts working days (Mon–Fri, excluding fixed public holidays) between two dates, inclusive. */
export function workingDaysBetween(start: Date, end: Date): number {
  if (end < start) return 0;
  let n = 0;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (d.getTime() <= last) {
    const dow = d.getUTCDay();
    const md = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    if (dow !== 0 && dow !== 6 && !SR_FIXED_HOLIDAYS.includes(md)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}
