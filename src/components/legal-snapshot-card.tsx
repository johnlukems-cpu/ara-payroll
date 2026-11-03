import { getI18n } from "@/lib/server/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Snap = {
  capturedAt: string;
  taxRuleSets: { id: string; name: string; verificationStatus: string; taxFreeMonthly: number; lumpSumMonthly: number; brackets: { upTo: number | null; rateBp: number }[]; bonusExemptAnnual: number; overtimeBrackets: { upTo: number | null; rateBp: number }[]; currency: string }[];
  aovRuleSets: { id: string; name: string; rateBp: number; exemptFromAge: number | null; verificationStatus: string }[];
  contributionSchemes: { id: string; type: string; name: string; method: string; employeeRateBp: number; employerRateBp: number; employeeAmount: number; employerAmount: number; currency: string; legalStatus: string }[];
};

/** Statutory rates and parameters used when the run was finalised. */
export async function LegalSnapshotCard({ snapshot }: { snapshot: unknown }) {
  const { t, f } = await getI18n();
  const s = snapshot as Snap;
  const brackets = (b: { upTo: number | null; rateBp: number }[], cur: string) => b.map((x) => `${f.pct(x.rateBp)}${x.upTo != null ? ` ≤ ${f.money(x.upTo, cur)}` : ""}`).join(" · ");
  return (
    <Card className="mt-6" data-testid="legal-snapshot">
      <CardHeader><CardTitle>{t("run.snapshotTitle")}</CardTitle><CardDescription>{t("run.snapshotSub", { date: f.date(s.capturedAt) })}</CardDescription></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {s.taxRuleSets.map((r) => (
          <div key={r.id}>
            <p className="font-medium">{t("run.snapshotTax")}: {r.name} <span className="text-xs text-muted-foreground">({t(`legal.${r.verificationStatus}` as never)})</span></p>
            <p className="text-xs text-muted-foreground">
              {t("run.snapshotTaxLine", { free: f.money(r.taxFreeMonthly, r.currency), lump: f.money(r.lumpSumMonthly, r.currency), bonus: f.money(r.bonusExemptAnnual, r.currency) })}
              <br />{t("run.snapshotBrackets")}: {brackets(r.brackets, r.currency)}
              <br />{t("run.snapshotOvertime")}: {brackets(r.overtimeBrackets, r.currency)}
            </p>
          </div>
        ))}
        {s.aovRuleSets.map((r) => (
          <p key={r.id}><span className="font-medium">AOV: {r.name}</span> <span className="text-xs text-muted-foreground">— {f.pct(r.rateBp)}{r.exemptFromAge ? `, ${t("run.snapshotAge", { age: r.exemptFromAge })}` : ""} ({t(`legal.${r.verificationStatus}` as never)})</span></p>
        ))}
        {s.contributionSchemes.map((c) => (
          <p key={c.id}><span className="font-medium">{t(`enums.contributionType.${c.type}` as never)}: {c.name}</span> <span className="text-xs text-muted-foreground">— {c.method === "FIXED" ? `${f.money(c.employeeAmount, c.currency)} / ${f.money(c.employerAmount, c.currency)}` : `${f.pct(c.employeeRateBp)} / ${f.pct(c.employerRateBp)}`} ({t(`legal.${c.legalStatus}` as never)})</span></p>
        ))}
        {s.contributionSchemes.length === 0 && <p className="text-xs text-muted-foreground">{t("run.snapshotNoSchemes")}</p>}
      </CardContent>
    </Card>
  );
}
