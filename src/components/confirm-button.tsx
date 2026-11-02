"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ActionState } from "@/lib/server/action";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/toaster";

/**
 * A one-click action button (with optional confirmation). The result is shown as a toast, because the
 * button itself often disappears after the action (e.g. "Approve" on a request that is now approved).
 */
export function ActionButton({ action, confirm, children, fields, ...props }: ButtonProps & { action: (s: ActionState, fd: FormData) => Promise<ActionState>; confirm?: string; fields?: Record<string, string> }) {
  const toast = useToast();
  const [, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.message) toast({ ok: result.ok, message: result.message });
    return result;
  }, null);
  const t = useTranslations();
  return (
    <form
      action={formAction}
      className="inline-flex"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" disabled={pending} {...props}>
        {pending ? t("common.working") : children}
      </Button>
    </form>
  );
}
