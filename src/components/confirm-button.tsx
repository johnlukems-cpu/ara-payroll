"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/server/action";
import { Button, type ButtonProps } from "@/components/ui/button";

/** A one-click action button (with optional confirmation) that reports errors inline. */
export function ActionButton({ action, confirm, children, fields, ...props }: ButtonProps & { action: (s: ActionState, fd: FormData) => Promise<ActionState>; confirm?: string; fields?: Record<string, string> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" disabled={pending} {...props}>
        {pending ? "Working…" : children}
      </Button>
      {state?.message && <span className={state.ok ? "text-xs text-success" : "text-xs text-destructive"} role="status">{state.message}</span>}
    </form>
  );
}
