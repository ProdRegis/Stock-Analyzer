"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChartNoAxesCombined, TriangleAlert } from "lucide-react";
import BestStocksPicker from "./BestStocksPicker";
import DemoBadge from "./DemoBadge";
import EmptyState from "./EmptyState";
import BreakoutScanner from "./BreakoutScanner";
import CopyTrading from "./CopyTrading";
import CorrelationHeatmap from "./CorrelationHeatmap";
import HoldingsTable from "./HoldingsTable";
import InvestmentThesis from "./InvestmentThesis";
import OptionsDesk from "./OptionsDesk";
import PortfolioAllocation from "./PortfolioAllocation";
import PortfolioInput from "./PortfolioInput";
import PortfolioSummary from "./PortfolioSummary";
import RecentNews from "./RecentNews";
import SavedPortfolios from "./SavedPortfolios";
import StopLossAdvisor from "./StopLossAdvisor";
import SellReminderList from "./SellReminderList";
import TabNav, { type DashboardTab } from "./TabNav";
import VolScreen from "./VolScreen";
import { PortfolioSkeleton } from "./Skeleton";
import { usePersistentStore } from "@/hooks/usePersistentStore";
import { DEMO_PORTFOLIO } from "@/lib/demo";
import {
  analyzableHoldings,
  holdingsNeedReanalysis,
} from "@/lib/holdings";
import { workingPortfolioStore } from "@/lib/portfolios";
import type { OpenOptionsHint, PortfolioAnalysis, PortfolioHolding } from "@/lib/types";

function TabPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div hidden={!active} className={active ? undefined : "hidden"}>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>("portfolio");
  const [visitedTabs, setVisitedTabs] = useState<DashboardTab[]>(["portfolio"]);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [analyzedHoldings, setAnalyzedHoldings] = useState<
    PortfolioHolding[] | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [thesisRequest, setThesisRequest] = useState<{
    symbol: string;
    at: number;
  } | null>(null);
  const [optionsRequest, setOptionsRequest] = useState<{
    symbol: string;
    at: number;
    eventDate?: string;
  } | null>(null);

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

  const stale =
    analysis != null && holdingsNeedReanalysis(holdings, analyzedHoldings);

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
      setAnalyzedHoldings(validHoldings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setAnalysis(null);
      setAnalyzedHoldings(null);
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

  function handleTabChange(tab: DashboardTab) {
    setActiveTab(tab);
    setVisitedTabs((current) =>
      current.includes(tab) ? current : [...current, tab]
    );
  }

  function openThesis(symbol: string) {
    setThesisRequest({ symbol, at: Date.now() });
    handleTabChange("thesis");
  }

  function openOptions(symbol: string, hint?: OpenOptionsHint) {
    setOptionsRequest({
      symbol,
      at: Date.now(),
      eventDate: hint?.eventDate,
    });
    handleTabChange("options");
  }

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
    setAnalyzedHoldings(null);
    setError(null);
  }

  const visited = (tab: DashboardTab) => visitedTabs.includes(tab);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TabNav activeTab={activeTab} onChange={handleTabChange} />

      <TabPanel active={activeTab === "portfolio"}>
        {showingSample && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-3">
            <DemoBadge label="Sample portfolio" />
            <p className="text-sm text-slate-400">
              These are example holdings so you can see the analysis right
              away. Edit any row to make it yours — your changes are saved in
              this browser.
            </p>
          </div>
        )}

        <div className="space-y-6">
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
                onClick={() => handleAnalyze(analyzableHoldings(holdings))}
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
              {stale && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  <span className="flex items-center gap-2">
                    <TriangleAlert
                      className="h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    Holdings changed since this analysis. Numbers below are from
                    the last run.
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleAnalyze(analyzableHoldings(holdings))
                    }
                    className="rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20"
                  >
                    Analyze again
                  </button>
                </div>
              )}

              <div
                className={`space-y-6 ${stale ? "opacity-60" : ""}`}
              >
                <PortfolioSummary analysis={analysis} />

                <div className="grid gap-6 lg:grid-cols-2">
                  <PortfolioAllocation analysis={analysis} />
                  <CorrelationHeatmap
                    symbols={analysis.portfolioRisk.correlationSymbols}
                    matrix={analysis.portfolioRisk.correlationMatrix}
                    avgCorrelation={analysis.portfolioRisk.avgCorrelation}
                    avgPairRSquared={analysis.portfolioRisk.avgPairRSquared}
                  />
                </div>

                <div>
                  <SellReminderList
                    analysis={analysis}
                    holdings={holdings}
                    onTargetChange={handleTargetChange}
                  />
                  <HoldingsTable
                    analysis={analysis}
                    holdings={holdings}
                    onTargetChange={handleTargetChange}
                    onOpenThesis={openThesis}
                    onOpenOptions={openOptions}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </TabPanel>

      {visited("thesis") && (
        <TabPanel active={activeTab === "thesis"}>
          <InvestmentThesis
            requestedSymbol={thesisRequest?.symbol}
            requestedAt={thesisRequest?.at}
          />
        </TabPanel>
      )}

      {visited("breakouts") && (
        <TabPanel active={activeTab === "breakouts"}>
          <BreakoutScanner
            active={activeTab === "breakouts"}
            onOpenThesis={openThesis}
            onOpenOptions={openOptions}
          />
        </TabPanel>
      )}

      {visited("picks") && (
        <TabPanel active={activeTab === "picks"}>
          <BestStocksPicker
            active={activeTab === "picks"}
            onOpenThesis={openThesis}
            onOpenOptions={openOptions}
          />
        </TabPanel>
      )}

      {visited("stop-loss") && (
        <TabPanel active={activeTab === "stop-loss"}>
          <StopLossAdvisor
            holdings={holdings}
            onOpenThesis={openThesis}
            onOpenOptions={openOptions}
          />
        </TabPanel>
      )}

      {visited("copy-trading") && (
        <TabPanel active={activeTab === "copy-trading"}>
          <CopyTrading
            active={activeTab === "copy-trading"}
            portfolioSymbols={portfolioSymbols}
            onOpenThesis={openThesis}
            onOpenOptions={openOptions}
          />
        </TabPanel>
      )}

      {visited("news") && (
        <TabPanel active={activeTab === "news"}>
          <RecentNews
            portfolioSymbols={portfolioSymbols}
            active={activeTab === "news"}
            onOpenThesis={openThesis}
            onOpenOptions={openOptions}
          />
        </TabPanel>
      )}

      {visited("options") && (
        <TabPanel active={activeTab === "options"}>
          <OptionsDesk
            active={activeTab === "options"}
            portfolioSymbols={portfolioSymbols}
            requestedSymbol={optionsRequest?.symbol}
            requestedAt={optionsRequest?.at}
            requestedEventDate={optionsRequest?.eventDate}
            onOpenThesis={openThesis}
            onOpenVolScreen={() => handleTabChange("vol-screen")}
          />
        </TabPanel>
      )}

      {visited("vol-screen") && (
        <TabPanel active={activeTab === "vol-screen"}>
          <VolScreen
            active={activeTab === "vol-screen"}
            onOpenThesis={openThesis}
            onOpenOptions={openOptions}
          />
        </TabPanel>
      )}
    </div>
  );
}
