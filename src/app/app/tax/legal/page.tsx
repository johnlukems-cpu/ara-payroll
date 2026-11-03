import Link from "next/link";
import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { findAovRuleSet, findRuleSet } from "@/lib/payroll/service";
import { isEffective } from "@/lib/payroll/contributions";
import { describeShare } from "@/lib/contribution-format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { LegalBadge } from "@/components/legal-badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.tabs.legal") };
}

type Evidence = { source: string; url: string; kind: string; finding: string; checkedAt: string };
type History = { date: string; previous: string; current: string; reason: string };
const STATES = ["IN_FORCE", "AMENDED", "TO_VERIFY", "REPEALED"] as const;

/** Legal register: sources, verification evidence and history, and the statutory settings actually used in payroll. */
export default async function LegalRegisterPage() {
  const ctx = await requirePage("tax.view");
  const { t, f } = await getI18n();
  const now = new Date();
  const [sources, ruleSet, aov, schemes, users] = await Promise.all([
    db.legalSource.findMany({ orderBy: [{ publishedAt: "desc" }] }),
    findRuleSet(ctx.company.id, now),
    findAovRuleSet(ctx.company.id, now),
    db.contributionScheme.findMany({ where: { companyId: ctx.company.id, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }, orderBy: { type: "asc" } }),
    db.user.findMany({ where: { memberships: { some: { companyId: ctx.company.id } } }, select: { id: true, name: true } }),
  ]);
  const who = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? "—" : "—");
  const cur = ruleSet?.currency ?? "SRD";

  // Which register entries are behind the settings used in payroll right now.
  const citations = JSON.stringify(ruleSet?.citations ?? []);
  const used = new Map<string, string[]>();
  const mark = (code: string, what: string) => used.set(code, [...(used.get(code) ?? []), what]);
  if (ruleSet) {
    for (const s of sources) if (citations.includes(s.publication.split(" (")[0])) mark(s.code, t("legalRegister.usedTax", { name: ruleSet.name }));
    mark("WLB-1981", t("legalRegister.usedTax", { name: ruleSet.name }));
  }
  if (aov) mark("WET-AOV", t("legalRegister.usedAov", { name: aov.name }));
  const typeCode: Record<string, string> = { HEALTH: "WNBZ-2014", PENSION: "WAP-2014", FVO: "FVO" };
  for (const s of schemes.filter(isEffective)) mark(typeCode[s.type], t("legalRegister.usedScheme", { name: s.name }));
  const leaveTypes = await db.leaveType.findMany({ where: { companyId: ctx.company.id, category: { in: ["MATERNITY", "PATERNITY", "ADOPTION"] } }, select: { name: true } });
  for (const l of leaveTypes) mark("SB-2019-64", t("legalRegister.usedLeave", { name: l.name }));

  const brackets = (b: unknown) => (b as { upTo: number | null; rateBp: number }[]).map((x) => `${f.pct(x.rateBp)}${x.upTo != null ? ` ≤ ${f.money(x.upTo, cur)}` : ""}`).join(" · ");

  return (
    <div className="space-y-6">
      <Alert variant="warning">{t("legalRegister.intro")}</Alert>
      <Alert variant="info">{t("legalRegister.researchNote")}</Alert>

      <Card data-testid="parameters-in-use">
        <CardHeader><CardTitle>{t("legalRegister.inUseTitle")}</CardTitle><CardDescription>{t("legalRegister.inUseSub")}</CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>{t("legalRegister.cols.name")}</TH><TH>{t("legalRegister.cols.value")}</TH><TH>{t("legalRegister.cols.validity")}</TH><TH>{t("legalRegister.cols.source")}</TH><TH>{t("legalRegister.cols.status")}</TH><TH>{t("legalRegister.cols.approved")}</TH></TR></THead>
          <TBody>
            {ruleSet && (
              <>
                {([
                  [t("legalRegister.param.taxFree"), `${f.money(ruleSet.taxFreeMonthly, cur)} / ${t("legalRegister.month")}`],
                  [t("legalRegister.param.lumpSum"), `${f.money(ruleSet.lumpSumMonthly, cur)} / ${t("legalRegister.month")}`],
                  [t("legalRegister.param.brackets"), brackets(ruleSet.brackets)],
                  [t("legalRegister.param.bonusExempt"), `${f.money(ruleSet.bonusExemptAnnual, cur)} / ${t("legalRegister.year")}`],
                  [t("legalRegister.param.overtime"), brackets(ruleSet.overtimeBrackets)],
                  [t("legalRegister.param.childAllowance"), t("legalRegister.childValue", { amount: f.money(ruleSet.childAllowanceExempt, cur), max: ruleSet.childAllowanceMaxChildren })],
                ] as const).map(([name, value]) => (
                  <TR key={name}>
                    <TD className="font-medium">{name}</TD><TD className="tabular text-xs">{value}</TD>
                    <TD className="whitespace-nowrap text-xs">{f.date(ruleSet.effectiveFrom)} – {ruleSet.effectiveTo ? f.date(ruleSet.effectiveTo) : t("assign.openEnded")}</TD>
                    <TD className="text-xs">{ruleSet.name}</TD>
                    <TD><LegalBadge status={ruleSet.verificationStatus} /></TD>
                    <TD className="text-xs">{ruleSet.approvedAt ? `${f.date(ruleSet.approvedAt)} · ${who(ruleSet.approvedById)}` : "—"}{ruleSet.verifiedAt && <span className="block">{t("legalRegister.verifiedBy", { date: f.date(ruleSet.verifiedAt), name: ruleSet.verifiedReviewer ?? who(ruleSet.verifiedById) })}</span>}</TD>
                  </TR>
                ))}
              </>
            )}
            {aov && (
              <TR>
                <TD className="font-medium">{t("legalRegister.param.aov")}</TD>
                <TD className="tabular text-xs">{f.pct(aov.rateBp)} · {t(`aovRules.base.${aov.base}`)}{aov.exemptFromAge ? ` · ${t("run.snapshotAge", { age: aov.exemptFromAge })}` : ""}</TD>
                <TD className="whitespace-nowrap text-xs">{f.date(aov.effectiveFrom)} – {aov.effectiveTo ? f.date(aov.effectiveTo) : t("assign.openEnded")}</TD>
                <TD className="text-xs">{aov.name}</TD>
                <TD><LegalBadge status={aov.verificationStatus} /></TD>
                <TD className="text-xs">{aov.approvedAt ? `${f.date(aov.approvedAt)} · ${who(aov.approvedById)}` : "—"}</TD>
              </TR>
            )}
            {schemes.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{t(`enums.contributionType.${s.type}`)}: {s.name}{!isEffective(s) && <Badge variant="muted" className="ml-1">{t("legalRegister.notUsed")}</Badge>}</TD>
                <TD className="tabular text-xs">{t("contrib.sharesLine", { employee: describeShare(s, "employee", f), employer: describeShare(s, "employer", f) })}</TD>
                <TD className="whitespace-nowrap text-xs">{f.date(s.effectiveFrom)} – {s.effectiveTo ? f.date(s.effectiveTo) : t("assign.openEnded")}</TD>
                <TD className="text-xs">{s.legalReference ?? "—"}</TD>
                <TD><LegalBadge status={s.legalStatus} /></TD>
                <TD className="text-xs">{s.approvedAt ? `${f.date(s.approvedAt)} · ${who(s.approvedById)}` : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <CardContent className="pt-3 text-xs text-muted-foreground">
          {t("legalRegister.manageHint")} <Link href="/app/tax/rules" className="text-primary hover:underline">{t("legalRegister.manageTax")}</Link> · <Link href="/app/tax/aov-rules" className="text-primary hover:underline">{t("legalRegister.manageAov")}</Link> · <Link href="/app/settings/contributions" className="text-primary hover:underline">{t("legalRegister.manageSchemes")}</Link>
        </CardContent>
      </Card>

      {STATES.map((state) => {
        const list = sources.filter((s) => s.state === state);
        if (list.length === 0) return null;
        return (
          <section key={state} className="space-y-4" data-testid={`legal-${state}`}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t(`legalRegister.state.${state}`)} ({list.length})</h2>
            {list.map((s) => {
              const evidence = s.evidence as Evidence[];
              const history = s.history as History[];
              const components = s.components as string[];
              const usage = used.get(s.code) ?? [];
              return (
                <Card key={s.code} id={s.code} className="scroll-mt-6" data-testid={`legal-source-${s.code}`}>
                  <CardHeader className="flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle>{s.title}</CardTitle>
                      <CardDescription>{s.publication}</CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <LegalBadge status={s.verificationStatus} />
                      {usage.length > 0 ? <Badge variant="accent">{t("legalRegister.inUse")}</Badge> : <Badge variant="muted">{t("legalRegister.notUsed")}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      {([
                        [t("legalRegister.f.article"), s.article],
                        [t("legalRegister.f.publication"), s.publication],
                        [t("legalRegister.f.published"), s.publishedAt ? f.date(s.publishedAt) : null],
                        [t("legalRegister.f.effective"), s.effectiveFrom ? f.date(s.effectiveFrom) : null],
                        [t("legalRegister.f.lastAmendment"), s.lastAmendment],
                        [t("legalRegister.f.lastChecked"), s.lastCheckedAt ? f.date(s.lastCheckedAt) : null],
                      ] as const).map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v ?? "—"}</dd></div>)}
                    </dl>
                    {s.summary && <p>{s.summary}</p>}
                    {(s.articles as { article: string; summary: string }[]).length > 0 && (
                      <ul className="list-disc space-y-0.5 pl-5 text-xs">
                        {(s.articles as { article: string; summary: string }[]).map((a, i) => <li key={i}>{a.article !== "—" ? <span className="font-medium">{t("legalRegister.article")} {a.article}: </span> : null}{a.summary}</li>)}
                      </ul>
                    )}
                    {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
                    {components.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 text-xs"><span className="text-muted-foreground">{t("legalRegister.f.components")}:</span>{components.map((c) => <Badge key={c} variant="muted">{c}</Badge>)}</div>
                    )}
                    {usage.length > 0 && <p className="text-xs"><span className="text-muted-foreground">{t("legalRegister.f.usedIn")}:</span> {usage.join(" · ")}</p>}
                    {evidence.length > 0 && (
                      <details className="rounded-lg border p-3 text-xs">
                        <summary className="cursor-pointer font-medium">{t("legalRegister.evidence", { count: evidence.length })}</summary>
                        <ul className="mt-2 space-y-2">
                          {evidence.map((e, i) => (
                            <li key={i}>
                              <Badge variant={e.kind === "OFFICIAL_EXCERPT" ? "accent" : "muted"}>{t(`legalRegister.kind.${e.kind}` as never)}</Badge>{" "}
                              <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{e.source}</a>
                              <span className="block text-muted-foreground">{e.finding} ({f.date(e.checkedAt)})</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {history.length > 0 && (
                      <details className="rounded-lg border p-3 text-xs">
                        <summary className="cursor-pointer font-medium">{t("legalRegister.history", { count: history.length })}</summary>
                        <ul className="mt-2 space-y-2">
                          {history.map((h, i) => (
                            <li key={i}><span className="text-muted-foreground">{f.date(h.date)} — {t("legalRegister.previous")}:</span> <s>{h.previous}</s><br /><span className="text-muted-foreground">{t("legalRegister.current")}:</span> {h.current}<br /><span className="text-muted-foreground">{t("legalRegister.reason")}:</span> {h.reason}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-primary hover:underline">{s.url}</a>}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
