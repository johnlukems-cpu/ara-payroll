"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { INTL_LOCALE, isLocale } from "@/i18n/config";

export type TrendPoint = { label: string; net: number; tax: number; aov: number };

export function PayrollTrend({ data, currency }: { data: TrendPoint[]; currency: string }) {
  const t = useTranslations();
  const raw = useLocale();
  const tag = INTL_LOCALE[isLocale(raw) ? raw : "nl"];
  const compact = (v: number) => new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const full = (v: number) => `${currency} ${new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#e2e6ee" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#5b667a" }} />
          <YAxis tickFormatter={compact} tickLine={false} axisLine={false} fontSize={12} width={48} tick={{ fill: "#5b667a" }} />
          <Tooltip cursor={{ fill: "rgba(1,37,88,0.04)" }} formatter={(v) => full(Number(v))} contentStyle={{ borderRadius: 10, border: "1px solid #e2e6ee", fontSize: 12 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="net" name={t("charts.net")} stackId="a" fill="#0b3d91" />
          <Bar isAnimationActive={false} dataKey="tax" name={t("charts.tax")} stackId="a" fill="#007eef" />
          <Bar isAnimationActive={false} dataKey="aov" name={t("charts.aov")} stackId="a" fill="#c9a24a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
