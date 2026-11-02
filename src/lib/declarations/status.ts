/**
 * Declaration status machine. Statuses after READY_FOR_DOWNLOAD are recorded manually by the user:
 * ARA Payroll never marks a declaration as submitted or accepted because a file was downloaded,
 * and there is no automated submission to the tax authorities.
 */
export const DECLARATION_STATUSES = [
  "IN_PREPARATION", "CALCULATED", "UNDER_REVIEW", "APPROVED", "READY_FOR_DOWNLOAD",
  "DOWNLOADED", "SUBMITTED", "ACCEPTED", "REJECTED", "PAID",
] as const;
export type DeclarationStatus = (typeof DECLARATION_STATUSES)[number];

export type DeclarationAction =
  | "recalculate" | "submitForReview" | "returnToCalculated" | "approve" | "generate" | "revokeApproval"
  | "download" | "recordSubmission" | "recordAccepted" | "recordRejected" | "recordPayment" | "createSupplementary";

const TRANSITIONS: Record<DeclarationAction, { from: DeclarationStatus[]; to: DeclarationStatus | null }> = {
  recalculate: { from: ["IN_PREPARATION", "CALCULATED"], to: "CALCULATED" },
  submitForReview: { from: ["CALCULATED"], to: "UNDER_REVIEW" },
  returnToCalculated: { from: ["UNDER_REVIEW"], to: "CALCULATED" },
  approve: { from: ["UNDER_REVIEW"], to: "APPROVED" },
  generate: { from: ["APPROVED", "READY_FOR_DOWNLOAD", "DOWNLOADED"], to: null }, // APPROVED → READY_FOR_DOWNLOAD; later regenerations keep the status
  revokeApproval: { from: ["APPROVED", "READY_FOR_DOWNLOAD"], to: "CALCULATED" },
  download: { from: ["READY_FOR_DOWNLOAD", "DOWNLOADED", "SUBMITTED", "ACCEPTED", "REJECTED", "PAID"], to: null }, // READY → DOWNLOADED only
  recordSubmission: { from: ["DOWNLOADED"], to: "SUBMITTED" },
  recordAccepted: { from: ["SUBMITTED"], to: "ACCEPTED" },
  recordRejected: { from: ["SUBMITTED"], to: "REJECTED" },
  recordPayment: { from: ["SUBMITTED", "ACCEPTED"], to: "PAID" },
  createSupplementary: { from: ["SUBMITTED", "ACCEPTED", "REJECTED", "PAID"], to: null },
};

export function canTransition(status: DeclarationStatus, action: DeclarationAction) {
  return TRANSITIONS[action].from.includes(status);
}

/** Resulting status of an action, or null when the action is not allowed in the current status. */
export function nextStatus(status: DeclarationStatus, action: DeclarationAction): DeclarationStatus | null {
  if (!canTransition(status, action)) return null;
  if (action === "generate") return status === "APPROVED" ? "READY_FOR_DOWNLOAD" : status;
  if (action === "download") return status === "READY_FOR_DOWNLOAD" ? "DOWNLOADED" : status;
  if (action === "createSupplementary") return status;
  return TRANSITIONS[action].to;
}

export function allowedActions(status: DeclarationStatus): DeclarationAction[] {
  return (Object.keys(TRANSITIONS) as DeclarationAction[]).filter((a) => canTransition(status, a));
}

/** Monthly LB/AOV return deadline: the configured day of the month following the period (filing window 26th–10th, pending verification). */
export function monthlyDeadline(year: number, month: number, dueDay = 10) {
  const y = month === 12 ? year + 1 : year;
  const m = month === 12 ? 1 : month + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(dueDay, last), 23, 59, 59));
}

/** The annual verzamelloonstaat deadline is not verified; default end of January of the following year (configurable later). */
export function annualDeadline(year: number) {
  return new Date(Date.UTC(year + 1, 0, 31, 23, 59, 59));
}
