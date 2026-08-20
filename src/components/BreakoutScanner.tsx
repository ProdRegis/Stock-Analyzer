"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radar } from "lucide-react";
import DemoBadge from "./DemoBadge";
import EmptyState from "./EmptyState";
import PriceChart from "./PriceChart";
import BusinessQualityBadge from "./BusinessQualityBadge";
import StockSearchInput, { resolveStockQuery } from "./StockSearchInput";
import { formatMarketState } from "@/lib/format";
import type { BreakoutCandidate, MarketSearchResult } from "@/lib/types";

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
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
    second: "2-digit",
  });
}

function LiveValue({
  value,
  className = "text-white",
}: {
  value: string;
  className?: string;
}) {
  return (
    <span className={`tabular-nums transition-colors duration-300 ${className}`}>
      {value}
    </span>
  );
}

function CandidateCard({
  candidate,
  onOpenThesis,
}: {
  candidate: BreakoutCandidate;
  onOpenThesis?: (symbol: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="surface-2 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold text-white">
              {candidate.symbol}
            </h3>
            <span className="rounded-full bg-blue-500/15 px-3 py-1 text-sm font-medium text-blue-300">
              <LiveValue value={`${candidate.likelihoodScore}% likelihood`} className="text-blue-300" />
            </span>
            <BusinessQualityBadge quality={candidate.businessQuality} size="sm" />
            {onOpenThesis && (
              <button
                type="button"
                onClick={() => onOpenThesis(candidate.symbol)}
                className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-blue-300 transition hover:border-blue-500/40 hover:text-blue-200"
              >
                Open thesis
              </button>
            )}
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-500">
              {formatMarketState(candidate.marketState)}
            </span>
          </div>
          <p className="text-sm text-slate-500">{candidate.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            Updated{" "}
            <LiveValue
              value={formatTimestamp(candidate.lastUpdated)}
              className="text-slate-500"
            />
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-semibold">
            <LiveValue
              value={formatCurrency(candidate.currentPrice)}
              className="text-white"
            />
          </p>
          <p
            className={`text-sm ${
              candidate.changePercent >= 0
                ? "text-emerald-400"
                : "text-red-400"
            }`}
          >
            <LiveValue
              value={`${candidate.changePercent >= 0 ? "+" : ""}${candidate.changePercent.toFixed(2)}%`}
              className={
                candidate.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
              }
            />
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">Nearest Resistance</p>
          <p className="font-medium text-red-300">
            {candidate.nearestResistance
              ? `$${candidate.nearestResistance.price.toFixed(2)}`
              : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">Distance to Breakout</p>
          <p className="font-medium">
            <LiveValue
              value={`${candidate.distanceToResistance.toFixed(1)}%`}
              className="text-white"
            />
          </p>
        </div>
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">Past Breakout Success</p>
          <p className="font-medium text-emerald-300">
            {formatPercent(candidate.historicalSuccessRate)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">Historical Breakouts</p>
          <p className="font-medium text-white">
            {candidate.pastBreakouts.length}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-400">{candidate.breakout.description}</p>

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-4 text-sm font-medium text-blue-400 transition hover:text-blue-300"
      >
        {expanded ? "Hide charts & history" : "Show live intraday & historical data"}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-700/60 pt-4">
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-400">
              Price with Resistance Lines
            </h4>
            <PriceChart
              history={candidate.history}
              intradayHistory={candidate.intradayHistory}
              resistanceLevels={candidate.resistanceLevels}
              symbol={candidate.symbol}
            />
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-400">
              Past Breakout Events
            </h4>
            {candidate.pastBreakouts.length === 0 ? (
              <p className="text-sm text-slate-500">
                No historical resistance breakouts detected in the last year.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Resistance</th>
                      <th className="py-2 pr-4 font-medium">Breakout Price</th>
                      <th className="py-2 pr-4 font-medium">Volume</th>
                      <th className="py-2 pr-4 font-medium">5d Follow-through</th>
                      <th className="py-2 pr-4 font-medium">10d Follow-through</th>
                      <th className="py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidate.pastBreakouts.slice(0, 10).map((event) => (
                      <tr
                        key={`${event.date}-${event.resistanceLevel}`}
                        className="border-b border-slate-100 text-slate-400"
                      >
                        <td className="py-2 pr-4">{event.date}</td>
                        <td className="py-2 pr-4">
                          ${event.resistanceLevel.toFixed(2)}
                        </td>
                        <td className="py-2 pr-4">
                          ${event.breakoutPrice.toFixed(2)}
                        </td>
                        <td className="py-2 pr-4">
                          {event.volumeRatio.toFixed(1)}x avg
                        </td>
                        <td
                          className={`py-2 pr-4 ${
                            event.followThrough5d >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {formatPercent(event.followThrough5d)}
                        </td>
                        <td
                          className={`py-2 pr-4 ${
                            event.followThrough10d >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {formatPercent(event.followThrough10d)}
                        </td>
                        <td className="py-2">
                          <span
                            className={
                              event.successful
                                ? "text-emerald-400"
                                : "text-red-400"
                            }
                          >
                            {event.successful ? "Successful" : "Failed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default function BreakoutScanner({
  active = true,
  onOpenThesis,
}: {
  active?: boolean;
  onOpenThesis?: (symbol: string) => void;
}) {
  const [candidates, setCandidates] = useState<BreakoutCandidate[]>([]);
  const candidatesRef = useRef<BreakoutCandidate[]>([]);
  const liveRefreshInFlight = useRef(false);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<MarketSearchResult | null>(
    null
  );
  const [liveUpdates, setLiveUpdates] = useState(true);
  const [showingSample, setShowingSample] = useState(false);

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  // Shared cached scan so a first-time visitor sees real results immediately
  // without spending their own scan budget.
  const loadSample = useCallback(async () => {
    setScanning(true);

    try {
      const response = await fetch("/api/breakout-scanner/demo", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sample unavailable");

      setCandidates(data.candidates ?? []);
      setScannedAt(data.scannedAt ?? null);
      setLiveUpdatedAt(data.scannedAt ?? null);
      setShowingSample(true);
    } catch {
      // The empty state is a perfectly good fallback here.
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    // Deferred so the scanning flag isn't written during this commit.
    const timer = window.setTimeout(loadSample, 0);
    return () => window.clearTimeout(timer);
  }, [loadSample]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setShowingSample(false);

    try {
      let symbolsOnly = false;
      let symbols: string[] = [];

      if (searchQuery.trim() || selectedStock) {
        const resolved = await resolveStockQuery(searchQuery, selectedStock);
        if (!resolved) {
          throw new Error(
            "No stock found. Pick a company from the dropdown or enter a valid ticker."
          );
        }
        symbols = [resolved.symbol];
        symbolsOnly = true;
        setSelectedStock(resolved);
        setSearchQuery(`${resolved.symbol} — ${resolved.name}`);
      }

      const response = await fetch("/api/breakout-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ symbols, symbolsOnly, minScore: 15 }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Scan failed");
      }

      setCandidates(data.candidates ?? []);
      setScannedAt(data.scannedAt ?? new Date().toISOString());
      setLiveUpdatedAt(data.scannedAt ?? new Date().toISOString());

      if (symbolsOnly && (data.candidates ?? []).length === 0) {
        setError(
          `No breakout setup found for ${symbols[0]} right now. Try another stock or scan the full market.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setCandidates([]);
      setScannedAt(null);
      setLiveUpdatedAt(null);
    } finally {
      setScanning(false);
    }
  }, [searchQuery, selectedStock]);

  const refreshLive = useCallback(async () => {
    const current = candidatesRef.current;
    if (current.length === 0 || scanning || liveRefreshInFlight.current) return;

    liveRefreshInFlight.current = true;
    setLiveRefreshing(true);

    try {
      const response = await fetch("/api/breakout-scanner/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ candidates: current }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Live refresh failed");
      }

      setCandidates(data.candidates ?? current);
      setLiveUpdatedAt(data.updatedAt ?? new Date().toISOString());
    } catch {
      // Keep showing the last good data if a live tick fails.
    } finally {
      liveRefreshInFlight.current = false;
      setLiveRefreshing(false);
    }
  }, [scanning]);

  useEffect(() => {
    if (!active || !liveUpdates || candidates.length === 0) return;

    const interval = setInterval(() => {
      refreshLive();
    }, 1000);

    return () => clearInterval(interval);
  }, [active, liveUpdates, candidates.length, refreshLive]);

  return (
    <div className="space-y-6">
      <section className="surface-2 rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Breakout Scanner</h2>
              {showingSample && <DemoBadge label="Sample scan" />}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {showingSample
                ? "A shared sample scan, refreshed every few minutes. Search a stock or run your own scan for live results."
                : "Run a full scan once, then prices, likelihood scores, and breakout distance update live every second. Durable businesses rank above similar chart setups that look speculative."}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            {scannedAt && <p>Full scan: {formatTimestamp(scannedAt)}</p>}
            {liveUpdatedAt && liveUpdates && (
              <p className="mt-1 flex items-center justify-end gap-1.5">
                {liveRefreshing && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                )}
                Live: {formatTimestamp(liveUpdatedAt)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <StockSearchInput
            className="flex-1"
            value={searchQuery}
            onChange={setSearchQuery}
            selected={selectedStock}
            onSelect={setSelectedStock}
            onClearSelection={() => setSelectedStock(null)}
            placeholder="Search ticker or company (e.g. Tesla, AAPL)"
            disabled={scanning}
          />
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-black transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scanning
              ? "Scanning..."
              : searchQuery.trim() || selectedStock
                ? "Search Stock"
                : "Scan All Market"}
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-500">
          Type a company name or ticker for suggestions, then search that stock only.
          Leave empty and scan to run the full market universe.
        </p>

        <label className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={liveUpdates}
            onChange={(event) => setLiveUpdates(event.target.checked)}
            className="rounded border-slate-600 bg-slate-800"
          />
          Live updates every second (price, % change, likelihood, distance)
        </label>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {scanning && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-8 text-center text-slate-500">
          Running full breakout scan with historical data...
        </div>
      )}

      {!scanning && candidates.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            Top Breakout Candidates ({candidates.length})
          </h3>
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.symbol}
              candidate={candidate}
              onOpenThesis={onOpenThesis}
            />
          ))}
        </div>
      )}

      {!scanning && candidates.length === 0 && !error && (
        <EmptyState
          icon={Radar}
          title="No scan run yet"
          description="Search a single stock by ticker or company name, or leave the box empty and scan the whole market to rank stocks by breakout likelihood."
        />
      )}
    </div>
  );
}
