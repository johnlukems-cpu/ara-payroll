import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";

const CUSTOMER = { NEW_REQUEST: "accent", IN_REVIEW: "accent", ACTIVE: "success", TRIAL: "default", PAYMENT_DUE: "warning", SUSPENDED: "destructive", CANCELLED: "muted" } as const;
const SUB = { TRIAL: "default", ACTIVE: "success", PAST_DUE: "warning", SUSPENDED: "destructive", CANCELLED: "muted", EXPIRED: "muted" } as const;
const INVOICE = { OPEN: "warning", PARTIALLY_PAID: "accent", PAID: "success", CREDITED: "muted", VOID: "muted" } as const;
const REQUEST = { NEW: "accent", IN_REVIEW: "default", INFO_REQUESTED: "warning", DEMO_SCHEDULED: "accent", APPROVED: "success", REJECTED: "muted", CONVERTED: "success" } as const;

export async function CustomerBadge({ status }: { status: keyof typeof CUSTOMER }) {
  const t = await getTranslations();
  return <Badge variant={CUSTOMER[status]}>{t(`saas.customerStatus.${status}`)}</Badge>;
}
export async function SubscriptionBadge({ status }: { status: keyof typeof SUB }) {
  const t = await getTranslations();
  return <Badge variant={SUB[status]}>{t(`saas.subStatus.${status}`)}</Badge>;
}
export async function InvoiceBadge({ status, overdue }: { status: keyof typeof INVOICE; overdue?: boolean }) {
  const t = await getTranslations();
  return overdue ? <Badge variant="destructive">{t("saas.invoiceOverdue")}</Badge> : <Badge variant={INVOICE[status]}>{t(`saas.invoiceStatus.${status}`)}</Badge>;
}
export async function RequestBadge({ status }: { status: keyof typeof REQUEST }) {
  const t = await getTranslations();
  return <Badge variant={REQUEST[status]}>{t(`saas.requestStatus.${status}`)}</Badge>;
}
