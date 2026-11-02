import type { ExchangeRate } from "@prisma/client";
import { getI18n } from "@/lib/server/i18n";
import { ActionButton } from "@/components/confirm-button";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { decideRateAction } from "@/app/actions/rates";

export async function RateTable({ rates, canDecide }: { rates: ExchangeRate[]; canDecide: boolean }) {
  const { t, f } = await getI18n();
  if (rates.length === 0) return <EmptyState title={t("rates.none")} description={t("rates.noneText")} />;
  return (
    <Table>
      <THead><TR><TH>{t("rates.cols.pair")}</TH><TH className="text-right">{t("rates.cols.rate")}</TH><TH>{t("rates.cols.effective")}</TH><TH>{t("rates.cols.source")}</TH><TH>{t("rates.cols.scope")}</TH><TH>{t("rates.cols.status")}</TH><TH>{t("rates.cols.notes")}</TH><TH /></TR></THead>
      <TBody>
        {rates.map((r) => (
          <TR key={r.id}>
            <TD className="font-medium whitespace-nowrap">{r.baseCurrency} → {r.quoteCurrency}</TD>
            <TD className="tabular text-right whitespace-nowrap">1 {r.baseCurrency} = {f.rate(r.rate.toString())} {r.quoteCurrency}</TD>
            <TD className="tabular whitespace-nowrap">{f.date(r.effectiveDate)}</TD>
            <TD>{t(`enums.rateSource.${r.source}`)}{r.provider && <span className="block text-xs text-muted-foreground">{r.provider}</span>}</TD>
            <TD><Badge variant="muted">{r.companyId ? t("rates.scopeCompany") : t("rates.scopePlatform")}</Badge></TD>
            <TD><StatusBadge status={r.status} /></TD>
            <TD className="max-w-48 truncate text-xs text-muted-foreground">{r.notes}</TD>
            <TD className="text-right">
              {canDecide && r.status === "PENDING" && r.companyId && (
                <div className="flex justify-end gap-1">
                  <ActionButton action={decideRateAction} fields={{ id: r.id, decision: "APPROVED" }} size="sm" variant="accent">{t("rates.approve")}</ActionButton>
                  <ActionButton action={decideRateAction} fields={{ id: r.id, decision: "REJECTED" }} size="sm" variant="outline">{t("rates.reject")}</ActionButton>
                </div>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
