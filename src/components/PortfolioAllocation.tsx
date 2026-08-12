"use client";

import { ChartPie } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PortfolioAnalysis } from "@/lib/types";

const SLICE_COLORS = [
  "#3b82f6",
  "#22d3ee",
  "#a78bfa",
  "#f97316",
  "#34d399",
  "#f472b6",
  "#facc15",
  "#60a5fa",
  "#fb7185",
  "#4ade80",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function PortfolioAllocation({
  analysis,
}: {
  analysis: PortfolioAnalysis;
}) {
  const data = analysis.holdings
    .map((holding) => ({
      symbol: holding.symbol,
      value: holding.value,
      weight: holding.weight * 100,
    }))
    .sort((a, b) => b.value - a.value);

  const largest = data[0];

  return (
    <section className="surface-2 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
        <ChartPie className="h-5 w-5 text-slate-500" aria-hidden="true" />
        Allocation
      </h3>
      <p className="mt-1 text-sm text-slate-400">
        How your capital is split across positions
      </p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        <div className="h-48 w-48 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="symbol"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.symbol}
                    fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="w-full space-y-1.5">
          {data.map((entry, index) => (
            <li
              key={entry.symbol}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length],
                  }}
                />
                <span className="truncate font-medium text-slate-200">
                  {entry.symbol}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-slate-400">
                {entry.weight.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      {largest && largest.weight > 40 && (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {largest.symbol} is {largest.weight.toFixed(0)}% of the portfolio — a
          single-name move will drive most of your returns.
        </p>
      )}
    </section>
  );
}
