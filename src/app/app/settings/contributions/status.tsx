import { AlertTriangle, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SchemeIssue, SchemeState } from "@/lib/payroll/contributions";

type T = (key: string, values?: Record<string, string | number>) => string;

const VARIANT: Record<SchemeState, "success" | "warning" | "destructive" | "muted" | "accent"> = {
  ACTIVE: "success", FUTURE: "accent", ENDED: "muted", INACTIVE: "muted", AWAITING_APPROVAL: "warning", NOT_CONFIGURED: "destructive", NOT_APPLICABLE: "muted",
};

export function StateBadge({ state, t }: { state: SchemeState; t: T }) {
  return <Badge variant={VARIANT[state]} data-state={state}>{t(`contrib.state.${state}`)}</Badge>;
}

/** Validation issues; blocking ones prevent finalising payroll. */
export function IssueList({ issues, t }: { issues: SchemeIssue[]; t: T }) {
  if (issues.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <ul className="space-y-1 text-xs">
      {issues.map((i) => (
        <li key={i.code} className={i.blocking ? "flex items-start gap-1 text-destructive" : "flex items-start gap-1 text-warning"}>
          {i.blocking ? <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />}
          <span>{t(`contrib.issue.${i.code}`, { expected: i.expected ?? "" })}{i.blocking ? ` — ${t("contrib.blocksPayroll")}` : ""}</span>
        </li>
      ))}
    </ul>
  );
}
