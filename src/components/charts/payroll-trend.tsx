"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TrendPoint = { label: string; net: number; tax: number; aov: number };

const fmt = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);

export function PayrollTrend({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#e2e6ee" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#5b667a" }} />
          <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={12} width={48} tick={{ fill: "#5b667a" }} />
          <Tooltip
            cursor={{ fill: "rgba(11,42,91,0.04)" }}
            formatter={(v) => `SRD ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e6ee", fontSize: 12 }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar isAnimationActive={false} dataKey="net" name="Net pay" stackId="a" fill="#0b2a5b" radius={[0, 0, 0, 0]} />
          <Bar isAnimationActive={false} dataKey="tax" name="Wage tax" stackId="a" fill="#0e9f8a" />
          <Bar isAnimationActive={false} dataKey="aov" name="AOV" stackId="a" fill="#c9a24a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
