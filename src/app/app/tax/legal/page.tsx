import { db } from "@/lib/db";
import { requirePage } from "@/lib/server/auth";
import { getI18n } from "@/lib/server/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { LegalBadge } from "@/components/legal-badge";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("tax.tabs.legal") };
}

export default async function LegalRegisterPage() {
  await requirePage("tax.view");
  const { t, f } = await getI18n();
  const sources = await db.legalSource.findMany({ orderBy: [{ publishedAt: "desc" }] });
  return (
    <div className="space-y-6">
      <Alert variant="warning">{t("legalRegister.intro")}</Alert>
      {sources.map((s) => (
        <Card key={s.code}>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>{s.publication} — {s.title}</CardTitle>
              <CardDescription>{s.subject}{s.publishedAt && ` · ${t("legalRegister.published", { date: f.date(s.publishedAt) })}`}{s.effectiveFrom && ` · ${t("legalRegister.effective", { date: f.date(s.effectiveFrom) })}`}</CardDescription>
            </div>
            <LegalBadge status={s.verificationStatus} />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(s.articles as { article: string; summary: string }[]).length > 0 && (
              <ul className="space-y-1">
                {(s.articles as { article: string; summary: string }[]).map((a, i) => <li key={i}><span className="font-medium">{a.article !== "—" ? `${t("legalRegister.article")} ${a.article}: ` : ""}</span>{a.summary}</li>)}
              </ul>
            )}
            {s.notes && <p className="text-xs text-muted-foreground">{s.notes}</p>}
            {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-primary hover:underline">{s.url}</a>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
