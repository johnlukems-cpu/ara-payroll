import type { ActionState } from "@/lib/server/action";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Collapsible administration form: a summary line that opens a small form with hidden fields
 * (e.g. id and op), the given inputs and a submit button. Results are reported as a toast.
 */
export function OpForm({ action, title, submit, hidden, children, testId, variant = "secondary", open }: {
  action: Action; title: string; submit: string; hidden: Record<string, string>; children?: React.ReactNode; testId?: string;
  variant?: "default" | "secondary" | "destructive" | "outline"; open?: boolean;
}) {
  return (
    <details className="rounded-lg border bg-muted/20 p-3 text-sm" data-testid={testId} open={open}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ActionForm action={action} notify="toast" className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        {children}
        <div className="sm:col-span-2"><SubmitButton size="sm" variant={variant}>{submit}</SubmitButton></div>
      </ActionForm>
    </details>
  );
}

/** A labelled input cell inside an OpForm. */
export function OpField({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={wide ? "space-y-1 sm:col-span-2" : "space-y-1"}><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}
