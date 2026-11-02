"use client";

import * as React from "react";
import { useActionState } from "react";
import type { ActionState } from "@/lib/server/action";
import { cn } from "@/lib/utils";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const FormErrors = React.createContext<Record<string, string[] | undefined>>({});

export function ActionForm({ action, children, className, resetOnSuccess, id }: { action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean; id?: string }) {
  const [state, formAction] = useActionState(action, null);
  const ref = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} id={id} noValidate>
      {state?.message && (
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
