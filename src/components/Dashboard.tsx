"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartNoAxesCombined, LineChart, TriangleAlert } from "lucide-react";
import BestStocksPicker from "./BestStocksPicker";
import DemoBadge from "./DemoBadge";
import EmptyState from "./EmptyState";
import BreakoutScanner from "./BreakoutScanner";
import CorrelationHeatmap from "./CorrelationHeatmap";
import PortfolioAllocation from "./PortfolioAllocation";
import PortfolioInput from "./PortfolioInput";
import PortfolioSummary from "./PortfolioSummary";
import RecentNews from "./RecentNews";
import SavedPortfolios from "./SavedPortfolios";
import StockCard from "./StockCard";
import StopLossAdvisor from "./StopLossAdvisor";
import SellReminderList from "./SellReminderList";
import TabNav, { type DashboardTab } from "./TabNav";
import { PortfolioSkeleton } from "./Skeleton";
import { usePersistentStore } from "@/hooks/usePersistentStore";
import { DEMO_PORTFOLIO } from "@/lib/demo";
import { workingPortfolioStore } from "@/lib/portfolios";
import type { PortfolioAnalysis, PortfolioHolding } from "@/lib/types";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("portfolio");
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoAnalyzed = useRef(false);

  // Editing writes straight through to storage, so a reload restores the editor.
  const storedHoldings = usePersistentStore(workingPortfolioStore);
  const holdings = storedHoldings ?? DEMO_PORTFOLIO;
  const showingSample = storedHoldings === null;

  const setHoldings = useCallback((next: PortfolioHolding[]) => {
    workingPortfolioStore.set(next);
  }, []);

  const portfolioSymbols = useMemo(
    () =>
      holdings
        .map((holding) => holding.symbol.trim().toUpperCase())
        .filter(Boolean),
    [holdings]
  );

  const handleAnalyze = useCallback(async (validHoldings: PortfolioHolding[]) => {
    if (validHoldings.length === 0) {
      setError("Add at least one stock with shares to analyze.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings: validHoldings }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Analysis failed");
      }

      setAnalysis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // A first-time visitor gets the sample portfolio analyzed for them, so the
  // dashboard is populated instead of asking them to type tickers first.
  useEffect(() => {
    if (autoAnalyzed.current || storedHoldings !== null) return;
    autoAnalyzed.current = true;

    const timer = window.setTimeout(() => handleAnalyze(DEMO_PORTFOLIO), 0);
    return () => window.clearTimeout(timer);
  }, [storedHoldings, handleAnalyze]);

  function handleTargetChange(
    symbol: string,
    target: { targetPrice?: number; targetDate?: string }
  ) {
    setHoldings(
      holdings.map((holding) =>
        holding.symbol.trim().toUpperCase() === symbol.toUpperCase()
          ? {
              ...holding,
              targetPrice: target.targetPrice,
              targetDate: target.targetDate,
            }
          : holding
      )
    );
  }

  function handleLoadPortfolio(loadedHoldings: PortfolioHolding[]) {
    setHoldings(loadedHoldings);
    setAnalysis(null);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TabNav activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "portfolio" && (
        <>
          {showingSample && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3">
              <DemoBadge label="Sample portfolio" />
              <p className="text-sm text-slate-400">
                These are example holdings so you can see the analysis right
                away. Edit any row to make it yours — your changes are saved in
                this browser.
              </p>
            </div>
          )}

          <PortfolioInput
            holdings={holdings}
            onHoldingsChange={setHoldings}
            onAnalyze={handleAnalyze}
            loading={loading}
          />

          <SavedPortfolios
            currentHoldings={holdings}
            onLoadPortfolio={handleLoadPortfolio}
          />

          {error && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <span className="flex items-center gap-2">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </span>
              <button
                type="button"
                onClick={() => handleAnalyze(holdings)}
                className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20"
              >
                Retry
              </button>
            </div>
          )}

          {loading && <PortfolioSkeleton />}

          {!analysis && !loading && !error && (
            <EmptyState
              icon={ChartNoAxesCombined}
              title="No analysis yet"
              description="Add your holdings above and run the analysis to see risk metrics, allocation, correlation, and per-stock technicals."
            />
          )}

          {analysis && !loading && (
            <>
              <PortfolioSummary analysis={analysis} />

              <div className="grid gap-6 lg:grid-cols-2">
                <PortfolioAllocation analysis={analysis} />
                <CorrelationHeatmap
                  symbols={analysis.portfolioRisk.correlationSymbols}
                  matrix={analysis.portfolioRisk.correlationMatrix}
                  avgCorrelation={analysis.portfolioRisk.avgCorrelation}
                />
              </div>

              <div>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                  <LineChart className="h-5 w-5 text-slate-500" aria-hidden="true" />
                  Individual Stock Analysis
                </h2>
                <SellReminderList analysis={analysis} holdings={holdings} />
                <div className="space-y-3">
                  {analysis.holdings.map((holding) => {
                    const stored = holdings.find(
                      (row) =>
                        row.symbol.trim().toUpperCase() === holding.symbol
                    );

                    return (
                      <StockCard
                        key={holding.symbol}
                        analysis={holding.analysis}
                        weight={holding.weight}
                        value={holding.value}
                        shares={holding.shares}
                        pnl={holding.pnl}
                        targetPrice={stored?.targetPrice}
                        targetDate={stored?.targetDate}
                        onTargetChange={(target) =>
                          handleTargetChange(holding.symbol, target)
                        }
                      />
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {activeTab === "breakouts" && <BreakoutScanner />}

      {activeTab === "picks" && <BestStocksPicker />}

      {activeTab === "stop-loss" && <StopLossAdvisor holdings={holdings} />}

      {activeTab === "news" && (
        <RecentNews portfolioSymbols={portfolioSymbols} />
      )}
    </div>
  );
}
