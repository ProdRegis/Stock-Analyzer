"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { ShieldAlert, TriangleAlert, Wallet } from "lucide-react";
import EmptyState from "./EmptyState";
import PriceChart from "./PriceChart";
import StopLossReasonList from "./StopLossReasonList";
import { Skeleton } from "./Skeleton";
import { formatMarketState } from "@/lib/format";
import type {
  PortfolioHolding,
  StopLossRecommendation,
  TradeDirection,
} from "@/lib/types";

interface StopLossAdvisorProps {
  holdings: PortfolioHolding[];
}

interface BatchFailure {
  symbol: string;
  error: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StopLossAdvisor({ holdings }: StopLossAdvisorProps) {
  const validHoldings = useMemo(
    () =>
      holdings.filter(
        (holding) => holding.symbol.trim().length > 0 && holding.shares > 0
      ),
    [holdings]
  );

  const [direction, setDirection] = useState<TradeDirection>("long");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StopLossRecommendation[]>([]);
  const [failures, setFailures] = useState<BatchFailure[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<
    Record<string, StopLossRecommendation | "loading">
  >({});

  const handleCalculate = useCallback(async () => {
    if (validHoldings.length === 0) return;

    setLoading(true);
    setError(null);
    setExpanded(null);
    setDetails({});

    try {
      const response = await fetch("/api/stop-loss/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: validHoldings, direction }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to calculate stops");
      }

      setRows(data.recommendations ?? []);
      setFailures(data.failures ?? []);
      setUpdatedAt(data.updatedAt ?? new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setRows([]);
      setFailures([]);
    } finally {
      setLoading(false);
    }
  }, [direction, validHoldings]);

  const toggleRow = useCallback(
    async (row: StopLossRecommendation) => {
      const next = expanded === row.symbol ? null : row.symbol;
      setExpanded(next);

      if (next && !details[row.symbol]) {
        setDetails((current) => ({ ...current, [row.symbol]: "loading" }));

        try {
          const response = await fetch("/api/stop-loss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol: row.symbol,
              direction: row.direction,
              shares: row.shares ?? undefined,
              avgCost: row.avgCost ?? undefined,
            }),
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error);

          setDetails((current) => ({ ...current, [row.symbol]: data }));
        } catch {
          setDetails((current) => {
            const copy = { ...current };
            delete copy[row.symbol];
            return copy;
          });
        }
      }
    },
    [details, expanded]
  );

  const totalAtRisk = rows.reduce(
    (sum, row) => sum + (row.maxLossDollars ?? 0),
    0
  );
  const totalValue = rows.reduce(
    (sum, row) => sum + (row.positionValue ?? 0),
    0
  );

  return (
    <div className="space-y-6">
      <section className="surface-2 rounded-2xl p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <ShieldAlert className="h-5 w-5 text-slate-500" aria-hidden="true" />
          Safety Stops
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Recommended safety-net stop orders for every holding, based on
          support, ATR, volatility, and past dip behavior.
        </p>

        {validHoldings.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Wallet}
              tone="notice"
              title="No holdings to protect yet"
              description="Add stocks with share counts on the Portfolio Analysis tab, then come back here to get a stop price for each position."
            />
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Position type
              </p>
              <div className="flex gap-2">
                {(["long", "short"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDirection(value)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      direction === value
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {value === "long" ? "Long (owned)" : "Short"}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCalculate}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Calculating…"
                : `Calculate stops for ${validHoldings.length} holding${
                    validHoldings.length === 1 ? "" : "s"
                  }`}
            </button>

            {updatedAt && !loading && (
              <p className="text-xs text-slate-500">
                Updated {formatTimestamp(updatedAt)}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <span className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </span>
            <button
              type="button"
              onClick={handleCalculate}
              className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium transition hover:bg-red-500/20"
            >
              Retry
            </button>
          </div>
        )}
      </section>

      {loading && (
        <section className="surface-2 space-y-2 rounded-2xl p-5">
          {Array.from({ length: Math.max(validHoldings.length, 3) }).map(
            (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            )
          )}
        </section>
      )}

      {rows.length > 0 && !loading && (
        <section className="surface-2 rounded-2xl p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="surface-3 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500">Positions covered</p>
              <p className="font-semibold tabular-nums text-white">
                {rows.length}
              </p>
            </div>
            <div className="surface-3 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500">Total position value</p>
              <p className="font-semibold tabular-nums text-white">
                {formatCurrency(totalValue)}
              </p>
            </div>
            <div className="surface-3 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-500">
                Total at risk if all stops trigger
              </p>
              <p className="font-semibold tabular-nums text-red-300">
                {formatCurrency(totalAtRisk)}
                {totalValue > 0 && (
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    ({((totalAtRisk / totalValue) * 100).toFixed(1)}%)
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Stock</th>
                  <th className="py-2 pr-4 text-right font-medium">Price</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    Set stop at
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">Risk</th>
                  <th className="py-2 pr-4 text-right font-medium">$ at risk</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    If stopped vs cost
                  </th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isOpen = expanded === row.symbol;
                  const detail = details[row.symbol];

                  return (
                    <Fragment key={row.symbol}>
                      <tr className="border-b border-slate-800 align-middle">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-white">{row.symbol}</p>
                          <p className="truncate text-xs text-slate-500">
                            {row.shares} sh · {formatMarketState(row.marketState)}
                          </p>
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-200">
                          {formatCurrency(row.currentPrice)}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className="rounded-md bg-red-500/10 px-2 py-1 font-semibold tabular-nums text-red-300">
                            {formatCurrency(row.stopLossPrice)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-300">
                          {row.stopLossPercent.toFixed(1)}%
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums text-red-300">
                          {row.maxLossDollars != null
                            ? formatCurrency(row.maxLossDollars)
                            : "—"}
                        </td>
                        <td className="py-3 pr-4 text-right tabular-nums">
                          {row.outcomeAtStopDollars == null ? (
                            <span className="text-slate-600">no cost basis</span>
                          ) : (
                            <span
                              className={
                                row.stopLocksInGain
                                  ? "text-emerald-300"
                                  : "text-red-300"
                              }
                            >
                              {row.stopLocksInGain ? "▲ " : "▼ "}
                              {formatCurrency(
                                Math.abs(row.outcomeAtStopDollars)
                              )}
                              {row.outcomeAtStopPercent != null && (
                                <span className="ml-1 text-xs text-slate-500">
                                  ({row.outcomeAtStopPercent >= 0 ? "+" : ""}
                                  {row.outcomeAtStopPercent.toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            type="button"
                            onClick={() => toggleRow(row)}
                            aria-expanded={isOpen}
                            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
                          >
                            {isOpen ? "Hide" : "Why?"}
                          </button>
                        </td>
                      </tr>

                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="pb-5">
                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                              <p className="font-medium text-red-200">
                                {row.stopLossLabel}
                              </p>
                              <p className="mt-2 text-sm text-slate-400">
                                {row.stopLossReason}
                              </p>
                              <p className="mt-2 text-xs text-slate-500">
                                {row.stopLossCalculation}
                              </p>

                              {row.avgCost != null && (
                                <p className="mt-3 rounded-lg bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
                                  You paid {formatCurrency(row.avgCost)} per
                                  share.{" "}
                                  {row.stopLocksInGain
                                    ? `This stop is above your cost, so triggering it still locks in a profit.`
                                    : `This stop is below your cost, so triggering it realizes a loss.`}
                                </p>
                              )}

                              <StopLossReasonList
                                reasons={row.stopLossReasons}
                                winningMethod={row.stopLossWinningMethod}
                              />

                              <div className="mt-4">
                                {detail === "loading" && (
                                  <Skeleton className="h-56 w-full" />
                                )}
                                {detail && detail !== "loading" && (
                                  <PriceChart
                                    history={detail.history}
                                    resistanceLevels={detail.resistanceLevels}
                                    supportLevels={detail.supportLevels}
                                    stopLossPrice={row.stopLossPrice}
                                    costBasis={row.avgCost ?? undefined}
                                    symbol={row.symbol}
                                    heightClassName="h-56"
                                  />
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {failures.length > 0 && (
            <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Couldn&apos;t compute stops for{" "}
              {failures.map((failure) => failure.symbol).join(", ")}.
            </p>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Stop prices are suggestions from historical price behavior, not
            financial advice. Place orders through your broker and re-check
            before market open.
          </p>
        </section>
      )}
    </div>
  );
}
