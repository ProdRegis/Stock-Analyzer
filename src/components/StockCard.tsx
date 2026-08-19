"use client";

import PriceChart from "./PriceChart";
import SellReminderBanner from "./SellReminderBanner";
import {
  evaluateSellReminder,
  suggestedTargetPrice,
} from "@/lib/sell-reminder";
import type { PortfolioPositionPnl, StockAnalysis } from "@/lib/types";

interface StockCardProps {
  analysis: StockAnalysis;
  value?: number;
  shares?: number;
  pnl?: PortfolioPositionPnl | null;
  targetPrice?: number;
  targetDate?: string;
  onTargetChange?: (target: {
    targetPrice?: number;
    targetDate?: string;
  }) => void;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function StockCard({
  analysis,
  value,
  shares,
  pnl,
  targetPrice,
  targetDate,
  onTargetChange,
}: StockCardProps) {
  const { movingAverages: ma, breakout } = analysis;
  const reminder = evaluateSellReminder({
    currentPrice: analysis.currentPrice,
    target: { targetPrice, targetDate },
  });
  const suggested = suggestedTargetPrice(
    analysis.currentPrice,
    analysis.resistanceLevels
  );
  const inputClass =
    "w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";

  return (
    <div
      className="space-y-4"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {reminder && <SellReminderBanner reminder={reminder} />}

      {pnl && (
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="surface-3 rounded-lg px-3 py-2">
            <p className="text-slate-400">Shares</p>
            <p className="font-medium tabular-nums text-white">{shares}</p>
          </div>
          <div className="surface-3 rounded-lg px-3 py-2">
            <p className="text-slate-400">Avg Cost</p>
            <p className="font-medium tabular-nums text-white">
              {formatCurrency(pnl.avgCost, analysis.currency)}
            </p>
          </div>
          <div className="surface-3 rounded-lg px-3 py-2">
            <p className="text-slate-400">Cost Basis</p>
            <p className="font-medium tabular-nums text-white">
              {formatCurrency(pnl.costBasis, analysis.currency)}
            </p>
          </div>
          <div className="surface-3 rounded-lg px-3 py-2">
            <p className="text-slate-400">Market Value</p>
            <p className="font-medium tabular-nums text-white">
              {value !== undefined
                ? formatCurrency(value, analysis.currency)
                : "—"}
            </p>
          </div>
        </div>
      )}

      {onTargetChange && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
          <h4 className="text-sm font-medium text-slate-300">Sell reminder</h4>
          <p className="mt-1 text-xs text-slate-500">
            A take-profit you chose — not a stop-loss. Leave either field blank
            if you only care about the other.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-400">
              Target price
              <input
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 210.00"
                aria-label={`${analysis.symbol} sell target price`}
                value={targetPrice ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  const parsed = Number(value);
                  onTargetChange({
                    targetPrice:
                      value.trim() === "" ||
                      !Number.isFinite(parsed) ||
                      parsed <= 0
                        ? undefined
                        : parsed,
                    targetDate,
                  });
                }}
                className={`mt-1 tabular-nums ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-slate-400">
              Sell-by date
              <input
                type="date"
                aria-label={`${analysis.symbol} sell-by date`}
                value={targetDate ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  onTargetChange({
                    targetPrice,
                    targetDate: value.trim() === "" ? undefined : value,
                  });
                }}
                className={`mt-1 ${inputClass}`}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggested != null && (
              <button
                type="button"
                onClick={() =>
                  onTargetChange({
                    targetPrice: suggested,
                    targetDate,
                  })
                }
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-white"
              >
                Use nearest resistance (${suggested.toFixed(2)})
              </button>
            )}
            {(targetPrice != null || targetDate) && (
              <button
                type="button"
                onClick={() =>
                  onTargetChange({
                    targetPrice: undefined,
                    targetDate: undefined,
                  })
                }
                className="rounded-lg px-3 py-1.5 text-xs text-slate-500 transition hover:bg-slate-800 hover:text-red-300"
              >
                Clear reminder
              </button>
            )}
          </div>
        </div>
      )}

      <PriceChart
        history={analysis.history}
        resistanceLevels={analysis.resistanceLevels}
        supportLevels={analysis.supportLevels}
        costBasis={pnl?.avgCost}
        symbol={analysis.symbol}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-medium text-slate-300">
            Moving Averages
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">SMA 20</span>
              <span className="tabular-nums text-cyan-300">
                {ma.sma20 ? formatCurrency(ma.sma20) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SMA 50</span>
              <span className="tabular-nums text-violet-300">
                {ma.sma50 ? formatCurrency(ma.sma50) : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SMA 200</span>
              <span className="tabular-nums text-orange-300">
                {ma.sma200 ? formatCurrency(ma.sma200) : "—"}
              </span>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium text-slate-300">
            Risk Metrics
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Volatility</span>
              <span className="tabular-nums text-white">
                {formatPercent(analysis.risk.annualizedVolatility)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Beta (vs SPY)</span>
              <span className="tabular-nums text-white">
                {analysis.risk.beta.toFixed(2)}
                {analysis.risk.regression && (
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    [{analysis.risk.regression.betaCiLow.toFixed(2)},{" "}
                    {analysis.risk.regression.betaCiHigh.toFixed(2)}]
                  </span>
                )}
              </span>
            </div>
            {analysis.risk.regression && (
              <div className="flex justify-between">
                <span className="text-slate-400">R² vs SPY</span>
                <span className="text-right tabular-nums text-white">
                  {analysis.risk.regression.rSquared.toFixed(2)}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    r {analysis.risk.regression.r.toFixed(2)} ·{" "}
                    {analysis.risk.regression.n} days
                  </span>
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Max Drawdown</span>
              <span className="tabular-nums text-white">
                {formatPercent(analysis.risk.maxDrawdown)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Sharpe (ann. √252)</span>
              <span
                className={`tabular-nums ${
                  analysis.risk.sharpeRatio >= 0
                    ? "text-emerald-300"
                    : "text-red-300"
                }`}
              >
                {analysis.risk.sharpeRatio.toFixed(2)}
              </span>
            </div>
          </div>
          {analysis.risk.regression && (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              R² is the share of this stock&apos;s daily moves that line up with
              SPY. High R² means beta is a useful description; low R² means this
              name does not track the market. The range next to beta is a 95%
              interval from that same fit.
            </p>
          )}
          {analysis.risk.metricSources && (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Sources: {analysis.risk.metricSources.prices}; beta via{" "}
              {analysis.risk.metricSources.beta}; rf from{" "}
              {analysis.risk.metricSources.riskFreeRate}.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-medium text-slate-300">
            Resistance Levels
          </h4>
          {analysis.resistanceLevels.length === 0 ? (
            <p className="text-sm text-slate-500">No clear levels detected</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {analysis.resistanceLevels.map((level) => (
                <li
                  key={level.price}
                  className="flex justify-between text-slate-300"
                >
                  <span className="tabular-nums">${level.price.toFixed(2)}</span>
                  <span className="text-slate-500">
                    {level.touches} touch{level.touches > 1 ? "es" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium text-slate-300">
            Breakout Signal
          </h4>
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              breakout.type === "bullish"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : breakout.type === "bearish"
                  ? "border-red-500/30 bg-red-500/10 text-red-200"
                  : "border-slate-600 bg-slate-800/60 text-slate-300"
            }`}
          >
            <p>{breakout.description}</p>
            {breakout.confidence > 0 && (
              <p className="mt-1 text-xs opacity-70">
                Confidence: {breakout.confidence}%
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
