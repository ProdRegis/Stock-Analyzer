"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { enrichHistoryWithMAs } from "@/lib/technical";
import type { PricePoint, ResistanceLevel } from "@/lib/types";

interface PriceChartProps {
  history: PricePoint[];
  resistanceLevels?: ResistanceLevel[];
  supportLevels?: ResistanceLevel[];
  stopLossPrice?: number;
  costBasis?: number;
  symbol: string;
  mode?: "daily" | "intraday";
  showMovingAverages?: boolean;
  showRangeSelector?: boolean;
  heightClassName?: string;
}

type RangeKey = "1M" | "3M" | "6M" | "1Y" | "2Y";

/** Approximate trading days per range. */
const RANGE_BARS: Record<RangeKey, number> = {
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
  "2Y": Number.MAX_SAFE_INTEGER,
};

const RANGE_KEYS: RangeKey[] = ["1M", "3M", "6M", "1Y", "2Y"];

function formatAxisLabel(value: string, mode: "daily" | "intraday") {
  if (mode === "intraday") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }
  return value.slice(5);
}

function formatTooltipLabel(value: string, mode: "daily" | "intraday") {
  if (mode === "intraday") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return value;
}

export default function PriceChart({
  history,
  resistanceLevels = [],
  supportLevels = [],
  stopLossPrice,
  costBasis,
  symbol,
  mode = "daily",
  showMovingAverages = true,
  showRangeSelector = true,
  heightClassName = "h-72",
}: PriceChartProps) {
  const [range, setRange] = useState<RangeKey>("6M");

  // Moving averages are computed on the full series, then trimmed to the
  // visible range so early bars aren't missing their SMA values.
  const enriched =
    mode === "daily" && showMovingAverages
      ? enrichHistoryWithMAs(history)
      : history;

  const data =
    mode === "daily"
      ? enriched.slice(-Math.min(RANGE_BARS[range], enriched.length))
      : enriched.slice(-240);

  const showRanges = mode === "daily" && showRangeSelector;
  const availableRanges = RANGE_KEYS.filter(
    (key, index) => index === 0 || RANGE_BARS[RANGE_KEYS[index - 1]] < history.length
  );

  return (
    <div>
      {showRanges && availableRanges.length > 1 && (
        <div className="mb-2 flex justify-end gap-1">
          {availableRanges.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRange(key)}
              aria-pressed={range === key}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                range === key
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      )}

      <div className={`${heightClassName} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`fill-${symbol}-${mode}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(value: string) => formatAxisLabel(value, mode)}
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickFormatter={(value: number) => `$${value.toFixed(0)}`}
              width={60}
            />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#94a3b8" }}
              labelFormatter={(value) => formatTooltipLabel(String(value), mode)}
              formatter={(value, name) => {
                const num = typeof value === "number" ? value : Number(value);
                return [
                  `$${Number.isFinite(num) ? num.toFixed(2) : "—"}`,
                  String(name),
                ];
              }}
            />
            {showMovingAverages && mode === "daily" && (
              <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
            )}
            <Area
              type="monotone"
              dataKey="close"
              name={mode === "intraday" ? "Intraday Price" : "Price"}
              stroke="#3b82f6"
              fill={`url(#fill-${symbol}-${mode})`}
              strokeWidth={2}
              dot={false}
            />
            {showMovingAverages && mode === "daily" && (
              <>
                <Line
                  type="monotone"
                  dataKey="sma20"
                  name="SMA 20"
                  stroke="#22d3ee"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="sma50"
                  name="SMA 50"
                  stroke="#a78bfa"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="sma200"
                  name="SMA 200"
                  stroke="#f97316"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                />
              </>
            )}
            {resistanceLevels.slice(0, 3).map((level) => (
              <ReferenceLine
                key={`r-${level.price}`}
                y={level.price}
                stroke="#f59e0b"
                strokeDasharray="6 4"
                strokeOpacity={0.55}
                label={{
                  value: `R ${level.price.toFixed(0)}`,
                  fill: "#fbbf24",
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
            ))}
            {supportLevels.slice(0, 3).map((level) => (
              <ReferenceLine
                key={`s-${level.price}`}
                y={level.price}
                stroke="#38bdf8"
                strokeDasharray="6 4"
                strokeOpacity={0.55}
                label={{
                  value: `S ${level.price.toFixed(0)}`,
                  fill: "#7dd3fc",
                  fontSize: 10,
                  position: "insideBottomLeft",
                }}
              />
            ))}
            {costBasis != null && (
              <ReferenceLine
                y={costBasis}
                stroke="#94a3b8"
                strokeWidth={1.5}
                strokeDasharray="2 3"
                label={{
                  value: `Cost $${costBasis.toFixed(2)}`,
                  fill: "#cbd5e1",
                  fontSize: 10,
                  position: "insideTopLeft",
                }}
              />
            )}
            {stopLossPrice != null && (
              <ReferenceLine
                y={stopLossPrice}
                stroke="#f87171"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `Stop $${stopLossPrice.toFixed(2)}`,
                  fill: "#f87171",
                  fontSize: 10,
                  position: "insideBottomRight",
                }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
