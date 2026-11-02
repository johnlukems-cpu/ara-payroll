"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INTL_LOCALE, isLocale } from "@/i18n/config";

export function DepartmentCosts({ data, currency }: { data: { name: string; cost: number }[]; currency: string }) {
  const t = useTranslations();
  const raw = useLocale();
  const tag = INTL_LOCALE[isLocale(raw) ? raw : "nl"];
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 44) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#5b667a" }} />
          <Tooltip formatter={(v) => `${currency} ${new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))}`} contentStyle={{ borderRadius: 10, border: "1px solid #e2e6ee", fontSize: 12 }} cursor={{ fill: "rgba(1,37,88,0.04)" }} />
          <Bar isAnimationActive={false} dataKey="cost" name={t("charts.employerCost")} fill="#007eef" radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
