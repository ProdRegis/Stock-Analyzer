import { TrendingDown, TrendingUp } from "lucide-react";
import RiskBadge from "./RiskBadge";
import type { PortfolioAnalysis } from "@/lib/types";

interface PortfolioSummaryProps {
  analysis: PortfolioAnalysis;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export default function PortfolioSummary({ analysis }: PortfolioSummaryProps) {
  const { portfolioRisk, totalUnrealizedGain, totalUnrealizedGainPercent } =
    analysis;

  const hasPnl =
    totalUnrealizedGain != null && totalUnrealizedGainPercent != null;
  const gainPositive = (totalUnrealizedGain ?? 0) >= 0;
  const TrendIcon = gainPositive ? TrendingUp : TrendingDown;

  // Neutral by default: color is reserved for gain/loss and risk thresholds.
  const metrics = [
    {
      label: "Volatility",
      value: formatPercent(portfolioRisk.annualizedVolatility),
      hint: "Annualized",
      accent: "text-slate-100",
    },
    {
      label: "Beta",
      value: portfolioRisk.beta.toFixed(2),
      hint: "vs SPY",
      accent: "text-slate-100",
    },
    {
      label: "Diversification",
      value: `${portfolioRisk.diversificationScore}`,
      hint: "out of 100",
      accent:
        portfolioRisk.diversificationScore < 40
          ? "text-amber-300"
          : "text-slate-100",
    },
    {
      label: "Avg Correlation",
      value: portfolioRisk.avgCorrelation.toFixed(2),
      hint: portfolioRisk.avgCorrelation >= 0.7 ? "Moves as one" : "Pairwise",
      accent:
        portfolioRisk.avgCorrelation >= 0.7 ? "text-amber-300" : "text-slate-100",
    },
    {
      label: "Concentration",
      value: `${portfolioRisk.concentrationRisk}%`,
      hint: portfolioRisk.concentrationRisk > 50 ? "Top-heavy" : "Balanced",
      accent:
        portfolioRisk.concentrationRisk > 50
          ? "text-amber-300"
          : "text-slate-100",
    },
  ];

  return (
    <section className="surface-1 rounded-2xl p-6 backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Total Portfolio Value
          </p>
          <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-white sm:text-5xl">
            {formatCurrency(analysis.totalValue)}
          </p>

          {hasPnl ? (
            <p
              className={`mt-2 flex items-center gap-1.5 text-base font-semibold tabular-nums ${
                gainPositive ? "text-emerald-400" : "text-red-400"
              }`}
            >
              <TrendIcon className="h-4 w-4" aria-hidden="true" />
              {gainPositive ? "+" : "−"}
              {formatCurrency(Math.abs(totalUnrealizedGain))}
              <span className="font-normal text-slate-400">
                ({totalUnrealizedGainPercent >= 0 ? "+" : ""}
                {totalUnrealizedGainPercent.toFixed(1)}% unrealized)
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Add an average cost per share to track profit and loss.
            </p>
          )}
        </div>

        <div className="text-right">
          <RiskBadge
            level={portfolioRisk.riskLevel}
            score={portfolioRisk.riskScore}
            size="lg"
          />
          <p className="mt-2 max-w-[13rem] text-xs text-slate-400">
            Weighted across all holdings by position size
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="surface-3 rounded-xl px-3 py-2.5">
            <p className="text-xs text-slate-400">{metric.label}</p>
            <p
              className={`mt-0.5 text-lg font-semibold tabular-nums ${metric.accent}`}
            >
              {metric.value}
            </p>
            <p className="text-[11px] text-slate-500">{metric.hint}</p>
          </div>
        ))}
      </div>

      {hasPnl && !analysis.costBasisComplete && (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          P&amp;L covers only the holdings that have an average cost entered.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Risk metrics use Yahoo adjusted closes (2y), SPY-aligned log returns, live
        Treasury yield for Sharpe, and blended beta when Yahoo statistics agree.
        Portfolio volatility uses date-synchronized holdings. Informational only —
        not financial advice.
      </p>
    </section>
  );
}
