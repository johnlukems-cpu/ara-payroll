"use client";

import * as React from "react";
import { useActionState } from "react";
import type { ActionState } from "@/lib/server/action";
import { useToast } from "@/components/toaster";
import { cn } from "@/lib/utils";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const FormErrors = React.createContext<Record<string, string[] | undefined>>({});

/**
 * Form bound to a server action with inline field errors. `notify="toast"` reports the result as an
 * app-wide toast instead — for forms that disappear after success (e.g. an approval step).
 */
export function ActionForm({ action, children, className, resetOnSuccess, id, notify = "inline" }: { action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; id?: string; notify?: "inline" | "toast" }) {
  const toast = useToast();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (notify === "toast" && result?.message) toast({ ok: result.ok, message: result.message });
    return result;
  }, null);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} id={id} noValidate>
      {notify === "inline" && state?.message && (
        <div role={state.ok ? "status" : "alert"} className={cn("mb-4 rounded-lg border px-4 py-2.5 text-sm", state.ok ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10 text-destructive")}>
          {state.message}
        </div>
      )}
      <FormErrors.Provider value={state?.errors ?? {}}>{children}</FormErrors.Provider>
    </form>
  );
}

export function FieldError({ name }: { name: string }) {
  const errors = React.useContext(FormErrors);
  const msg = errors[name]?.[0];
  return msg ? <p className="text-xs text-destructive">{msg}</p> : null;
}
