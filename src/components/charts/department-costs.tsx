"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function DepartmentCosts({ data }: { data: { name: string; cost: number }[] }) {
  return (
    <div className="w-full" style={{ height: Math.max(160, data.length * 44) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: "#5b667a" }} />
          <Tooltip formatter={(v) => `SRD ${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} contentStyle={{ borderRadius: 10, border: "1px solid #e2e6ee", fontSize: 12 }} cursor={{ fill: "rgba(11,42,91,0.04)" }} />
          <Bar isAnimationActive={false} dataKey="cost" name="Employer cost" fill="#0e9f8a" radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
