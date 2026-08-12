"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
import { CHART_RANGES, type ChartRange, type PricePoint, type ResistanceLevel } from "@/lib/types";

interface PriceChartProps {
  /** Daily bars, typically two years. Serves the 1M, 3M, and 1Y spans locally. */
  history: PricePoint[];
  /**
   * Today's bars, when the caller already polls them. Passing these keeps the
   * 1D view on the caller's live data instead of refetching it.
   */
  intradayHistory?: PricePoint[];
  /** Real ticker. Spans that aren't in `history` are fetched under this symbol. */
  symbol: string;
  resistanceLevels?: ResistanceLevel[];
  supportLevels?: ResistanceLevel[];
  stopLossPrice?: number;
  costBasis?: number;
  showMovingAverages?: boolean;
  showRangeSelector?: boolean;
  defaultRange?: ChartRange;
  heightClassName?: string;
}

/** Approximate trading days per span, for cutting the local daily series. */
const RANGE_BARS: Partial<Record<ChartRange, number>> = {
  "1M": 21,
  "3M": 63,
  "1Y": 252,
};

const INTRADAY_RANGES: ChartRange[] = ["1D", "7D"];

const INTERVAL_LABEL: Record<ChartRange, string> = {
  "1D": "1-minute bars",
  "7D": "15-minute bars",
  "1M": "daily bars",
  "3M": "daily bars",
  "1Y": "daily bars",
  "5Y": "weekly bars",
};

/**
 * Keeps only bars from the latest calendar day. A caller's intraday feed can
 * run back into the previous session, which would make 1D show two.
 */
function lastSessionOnly(points: PricePoint[]): PricePoint[] {
  if (points.length === 0) return points;

  const lastDay = points[points.length - 1].date.split("T")[0];
  return points.filter((point) => point.date.startsWith(lastDay));
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAxisLabel(value: string, range: ChartRange): string {
  const date = parseDate(value);

  if (range === "1D") {
    return date
      ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : value;
  }

  if (range === "7D") {
    return date
      ? date.toLocaleDateString([], { month: "short", day: "numeric" })
      : value;
  }

  // Five years of month-day ticks is unreadable, so show the month and year.
  if (range === "5Y") {
    return date
      ? date.toLocaleDateString([], { month: "short", year: "2-digit" })
      : value.slice(0, 7);
  }

  return value.slice(5);
}

function formatTooltipLabel(value: string, range: ChartRange): string {
  const date = parseDate(value);
  if (!date) return value;

  if (INTRADAY_RANGES.includes(range)) {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PriceChart({
  history,
  intradayHistory,
  symbol,
  resistanceLevels = [],
  supportLevels = [],
  stopLossPrice,
  costBasis,
  showMovingAverages = true,
  showRangeSelector = true,
  defaultRange = "3M",
  heightClassName = "h-72",
}: PriceChartProps) {
  const [range, setRange] = useState<ChartRange>(defaultRange);
  const [fetchedByRange, setFetchedByRange] = useState<
    Partial<Record<ChartRange, PricePoint[]>>
  >({});
  const [errorByRange, setErrorByRange] = useState<
    Partial<Record<ChartRange, string>>
  >({});

  // Moving averages are computed on the full series, then trimmed to the
  // visible range so early bars aren't missing their SMA values.
  const enriched = useMemo(
    () => (showMovingAverages ? enrichHistoryWithMAs(history) : history),
    [history, showMovingAverages]
  );

  // Spans the caller already has data for. Everything else goes to the API,
  // which is why a chart sitting on its default span costs no requests.
  const localSeries = useMemo((): PricePoint[] | null => {
    if (range === "1D") {
      return intradayHistory && intradayHistory.length > 0
        ? lastSessionOnly(intradayHistory)
        : null;
    }

    const bars = RANGE_BARS[range];
    if (bars == null || enriched.length === 0) return null;

    return enriched.slice(-Math.min(bars, enriched.length));
  }, [range, intradayHistory, enriched]);

  const fetched = fetchedByRange[range];
  const rangeError = errorByRange[range];
  const data = localSeries ?? fetched ?? [];
  const loading = localSeries == null && fetched == null && rangeError == null;

  useEffect(() => {
    if (localSeries != null || fetched != null || rangeError != null) return;
    if (!symbol) return;

    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(
          `/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`,
          { cache: "no-store" }
        );
        const payload = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(payload.error ?? "Chart data unavailable");
        }

        setFetchedByRange((prev) => ({ ...prev, [range]: payload.points ?? [] }));
      } catch (error) {
        if (cancelled) return;
        setErrorByRange((prev) => ({
          ...prev,
          [range]:
            error instanceof Error ? error.message : "Chart data unavailable",
        }));
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [range, symbol, localSeries, fetched, rangeError]);

  const gradientId = useId();
  // SMA windows are counted in bars, so they only mean what their names say on
  // the daily series. Intraday and weekly spans drop them rather than mislead.
  const withMovingAverages =
    showMovingAverages && localSeries != null && RANGE_BARS[range] != null;

  return (
    <div>
      {showRangeSelector && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {loading ? "Loading…" : INTERVAL_LABEL[range]}
          </span>
          <div className="flex gap-1">
            {CHART_RANGES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                aria-pressed={range === key}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  range === key
                    ? "bg-blue-600 text-black"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`${heightClassName} w-full`}>
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 px-4 text-center text-sm text-slate-500">
            {loading
              ? "Loading chart…"
              : (rangeError ?? `No ${range} data available for ${symbol}.`)}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00c805" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#00c805" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#23282e" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#7d858d", fontSize: 11 }}
                tickFormatter={(value: string) => formatAxisLabel(value, range)}
                minTickGap={40}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: "#7d858d", fontSize: 11 }}
                tickFormatter={(value: number) => `$${value.toFixed(0)}`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  background: "#131417",
                  border: "1px solid #23282e",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#7d858d" }}
                labelFormatter={(value) => formatTooltipLabel(String(value), range)}
                formatter={(value, name) => {
                  const num = typeof value === "number" ? value : Number(value);
                  return [
                    `$${Number.isFinite(num) ? num.toFixed(2) : "—"}`,
                    String(name),
                  ];
                }}
              />
              {withMovingAverages && (
                <Legend wrapperStyle={{ fontSize: 12, color: "#7d858d" }} />
              )}
              <Area
                type="monotone"
                dataKey="close"
                name="Price"
                stroke="#00c805"
                fill={`url(#${gradientId})`}
                strokeWidth={2}
                dot={false}
              />
              {withMovingAverages && (
                <>
                  <Line
                    type="monotone"
                    dataKey="sma20"
                    name="SMA 20"
                    stroke="#33d9ff"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="sma50"
                    name="SMA 50"
                    stroke="#ffd426"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="sma200"
                    name="SMA 200"
                    stroke="#b8bfc5"
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
                  stroke="#f5c400"
                  strokeDasharray="6 4"
                  strokeOpacity={0.55}
                  label={{
                    value: `R ${level.price.toFixed(0)}`,
                    fill: "#ffd426",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
              ))}
              {supportLevels.slice(0, 3).map((level) => (
                <ReferenceLine
                  key={`s-${level.price}`}
                  y={level.price}
                  stroke="#00c8f0"
                  strokeDasharray="6 4"
                  strokeOpacity={0.55}
                  label={{
                    value: `S ${level.price.toFixed(0)}`,
                    fill: "#7ce8ff",
                    fontSize: 10,
                    position: "insideBottomLeft",
                  }}
                />
              ))}
              {costBasis != null && (
                <ReferenceLine
                  y={costBasis}
                  stroke="#7d858d"
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  label={{
                    value: `Cost $${costBasis.toFixed(2)}`,
                    fill: "#d5dade",
                    fontSize: 10,
                    position: "insideTopLeft",
                  }}
                />
              )}
              {stopLossPrice != null && (
                <ReferenceLine
                  y={stopLossPrice}
                  stroke="#ff5000"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `Stop $${stopLossPrice.toFixed(2)}`,
                    fill: "#ff5000",
                    fontSize: 10,
                    position: "insideBottomRight",
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
