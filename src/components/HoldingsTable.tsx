"use client";

import { Fragment, useState } from "react";
import { ChevronRight, LineChart } from "lucide-react";
import RiskBadge from "./RiskBadge";
import StockCard from "./StockCard";
import { evaluateSellReminder } from "@/lib/sell-reminder";
import type { PortfolioAnalysis, PortfolioHolding } from "@/lib/types";

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

interface HoldingsTableProps {
  analysis: PortfolioAnalysis;
  holdings: PortfolioHolding[];
  onTargetChange: (
    symbol: string,
    target: { targetPrice?: number; targetDate?: string }
  ) => void;
}

export default function HoldingsTable({
  analysis,
  holdings,
  onTargetChange,
}: HoldingsTableProps) {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  return (
    <section className="surface-2 overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b border-slate-700/60 px-4 py-3">
        <LineChart className="h-5 w-5 text-slate-500" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-white">Holdings</h2>
        <span className="text-sm tabular-nums text-slate-500">
          {analysis.holdings.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs font-medium uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Ticker
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Price
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Day
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 text-right font-medium sm:table-cell"
              >
                P&amp;L
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 text-right font-medium md:table-cell"
              >
                Weight
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Risk
              </th>
            </tr>
          </thead>
          <tbody>
            {analysis.holdings.map((holding) => {
              const stored = holdings.find(
                (row) => row.symbol.trim().toUpperCase() === holding.symbol
              );
              const expanded = expandedSymbol === holding.symbol;
              const analysisRow = holding.analysis;
              const up = analysisRow.changePercent >= 0;
              const pnl = holding.pnl;
              const pnlPositive = (pnl?.unrealizedGain ?? 0) >= 0;
              const reminder = evaluateSellReminder({
                currentPrice: analysisRow.currentPrice,
                target: {
                  targetPrice: stored?.targetPrice,
                  targetDate: stored?.targetDate,
                },
              });
              const sellNow =
                reminder?.urgency === "hit" || reminder?.urgency === "due";

              return (
                <Fragment key={holding.symbol}>
                  <tr
                    className={`cursor-pointer border-b border-slate-800/80 transition hover:bg-slate-800/40 ${
                      expanded ? "bg-slate-800/30" : ""
                    }`}
                    tabIndex={0}
                    role="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedSymbol(expanded ? null : holding.symbol)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedSymbol(expanded ? null : holding.symbol);
                      }
                    }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-slate-500 transition ${
                            expanded ? "rotate-90 text-slate-300" : ""
                          }`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">
                              {holding.symbol}
                            </span>
                            {sellNow && (
                              <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-200">
                                Sell now
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {analysisRow.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-white">
                      {formatCurrency(
                        analysisRow.currentPrice,
                        analysisRow.currency
                      )}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums ${
                        up ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {up ? "+" : ""}
                      {analysisRow.changePercent.toFixed(2)}%
                    </td>
                    <td
                      className={`hidden px-3 py-3 text-right tabular-nums sm:table-cell ${
                        pnl
                          ? pnlPositive
                            ? "text-emerald-300"
                            : "text-red-300"
                          : "text-slate-500"
                      }`}
                    >
                      {pnl
                        ? `${pnlPositive ? "+" : "−"}${formatCurrency(
                            Math.abs(pnl.unrealizedGain),
                            analysisRow.currency
                          )}`
                        : "—"}
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums text-slate-300 md:table-cell">
                      {(holding.weight * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RiskBadge
                        level={analysisRow.risk.riskLevel}
                        score={analysisRow.risk.riskScore}
                        size="sm"
                      />
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-slate-800/80 bg-slate-950/40">
                      <td colSpan={6} className="px-4 py-4">
                        <StockCard
                          analysis={analysisRow}
                          value={holding.value}
                          shares={holding.shares}
                          pnl={holding.pnl}
                          targetPrice={stored?.targetPrice}
                          targetDate={stored?.targetDate}
                          onTargetChange={(target) =>
                            onTargetChange(holding.symbol, target)
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-800 px-4 py-2.5 text-xs text-slate-500">
        Open a row for the chart, sell reminder, and risk metrics.
      </p>
    </section>
  );
}
