"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Sparkles } from "lucide-react";
import DemoBadge from "./DemoBadge";
import EmptyState from "./EmptyState";
import PriceChart from "./PriceChart";
import StockSearchInput, { resolveStockQuery } from "./StockSearchInput";
import StopLossReasonList from "./StopLossReasonList";
import { formatMarketState } from "@/lib/format";
import type { BuyTimingWindow, DipCandidate, DipSensitivity, MarketSearchResult, SellReasonDetail, TradeDirection } from "@/lib/types";

type DirectionFilter = "all" | TradeDirection;
type TimingFilter = "all" | "tomorrow" | "this_week";

/** How many top-ranked candidates keep ticking on the one-second live poll. */
const LIVE_REFRESH_LIMIT = 12;

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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

const sellReasonStyles: Record<
  SellReasonDetail["category"],
  { badge: string; border: string }
> = {
  calculation: {
    badge: "bg-blue-500/15 text-blue-300",
    border: "border-blue-500/20",
  },
  technical: {
    badge: "bg-cyan-500/15 text-cyan-300",
    border: "border-cyan-500/20",
  },
  news: {
    badge: "bg-amber-500/15 text-amber-300",
    border: "border-amber-500/20",
  },
  event: {
    badge: "bg-violet-500/15 text-violet-300",
    border: "border-violet-500/20",
  },
  prediction: {
    badge: "bg-emerald-500/15 text-emerald-300",
    border: "border-emerald-500/20",
  },
};

const sellReasonCategoryLabels: Record<SellReasonDetail["category"], string> = {
  calculation: "Calculation",
  technical: "Technical",
  news: "News",
  event: "Event",
  prediction: "Prediction",
};

function SellReasonList({
  reasons,
  direction,
}: {
  reasons: SellReasonDetail[];
  direction: TradeDirection;
}) {
  if (reasons.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-orange-500/20 bg-orange-500/5 p-3">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-orange-400">
        Why you should {direction === "long" ? "sell" : "cover"}
      </p>
      <div className="space-y-2">
        {reasons.map((reason) => {
          const styles = sellReasonStyles[reason.category];
          return (
            <div
              key={reason.id}
              className={`rounded-lg border bg-slate-900/40 p-3 ${styles.border}`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-medium ${styles.badge}`}
                >
                  {sellReasonCategoryLabels[reason.category]}
                </span>
                <span className="text-sm font-medium text-white">{reason.title}</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-400">{reason.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LiveClock({ active = true }: { active?: boolean }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
        Live market date & time
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
        {now.toLocaleDateString([], {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
      <p className="text-2xl font-bold tabular-nums text-emerald-300">
        {now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </p>
    </div>
  );
}

function timingMatchesFilter(
  buyTiming: BuyTimingWindow,
  filter: TimingFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "tomorrow") {
    return buyTiming === "now" || buyTiming === "tomorrow";
  }
  return ["now", "tomorrow", "2-3_days", "this_week"].includes(buyTiming);
}

function DirectionBadge({ direction }: { direction: TradeDirection }) {
  if (direction === "long") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-300">
        Long — buy the dip
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-500/15 px-3 py-1 text-sm font-medium text-red-300">
      Short — fade the move
    </span>
  );
}

function DipCandidateCard({ candidate }: { candidate: DipCandidate }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="surface-2 rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-white">{candidate.symbol}</h3>
            <DirectionBadge direction={candidate.direction} />
            <span className="rounded-full bg-blue-500/15 px-3 py-1 text-sm font-medium text-blue-300">
              {candidate.recoveryScore}% score
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-500">
              {formatMarketState(candidate.marketState)}
            </span>
          </div>
          <p className="text-sm text-slate-500">{candidate.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            Updated {formatTimestamp(candidate.lastUpdated)}
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-semibold text-white">
            {formatCurrency(candidate.currentPrice)}
          </p>
          <p
            className={`text-sm ${
              candidate.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {candidate.changePercent >= 0 ? "+" : ""}
            {candidate.changePercent.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">
            {candidate.direction === "long" ? "Dip Size" : "Extension / Breakdown"}
          </p>
          <p className="font-medium text-amber-300">
            {formatPercent(candidate.dipPercent)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">RSI (14)</p>
          <p
            className={`font-medium ${
              candidate.rsi <= 30
                ? "text-emerald-300"
                : candidate.rsi >= 70
                  ? "text-red-300"
                  : "text-white"
            }`}
          >
            {candidate.rsi.toFixed(0)}
          </p>
        </div>
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">
            {candidate.direction === "long" ? "Predicted bounce" : "Predicted move"}
          </p>
          <p className="font-medium text-cyan-300">{candidate.predictedRecoveryLabel}</p>
        </div>
        <div className="rounded-lg bg-slate-800/60 px-3 py-2">
          <p className="text-xs text-slate-500">
            {candidate.direction === "long" ? "Sell target" : "Cover target"}
          </p>
          <p className="font-medium text-orange-300">
            {candidate.sellTargetPrice
              ? `$${candidate.sellTargetPrice.toFixed(2)}`
              : "RSI-based exit"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-violet-400">
            When to {candidate.direction === "long" ? "buy" : "short"}
          </p>
          <p className="font-medium text-violet-200">{candidate.buyTimingLabel}</p>
          <p className="mt-2 text-xs text-violet-300/80">
            {candidate.predictedRecoveryLabel}
          </p>
        </div>
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-orange-400">
            When to {candidate.direction === "long" ? "sell" : "cover"}
          </p>
          <p className="font-medium text-orange-200">{candidate.sellTimingLabel}</p>
          <p className="mt-2 text-xs text-orange-300/80">
            {candidate.predictedSellLabel}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-red-400">
          {candidate.direction === "long" ? "Safety stop (limit sell)" : "Safety stop (cover)"}
        </p>
        <p className="font-medium text-red-200">{candidate.stopLossLabel}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-900/40 px-3 py-2">
            <p className="text-xs text-slate-500">Stop price</p>
            <p className="font-semibold text-red-300">
              ${candidate.stopLossPrice.toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-900/40 px-3 py-2">
            <p className="text-xs text-slate-500">
              {candidate.direction === "long" ? "Max loss from entry" : "Max loss if reversed"}
            </p>
            <p className="font-semibold text-red-300">
              {formatPercent(candidate.stopLossPercent)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400">{candidate.stopLossReason}</p>
        <p className="mt-2 text-xs text-slate-500">{candidate.stopLossCalculation}</p>
        <StopLossReasonList
          reasons={candidate.stopLossReasons ?? []}
          winningMethod={candidate.stopLossWinningMethod ?? "Blended methods"}
        />
      </div>

      {candidate.direction === "long" && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-800/60 px-3 py-2">
            <p className="text-xs text-slate-500">Nearest Support</p>
            <p className="font-medium text-emerald-300">
              {candidate.nearestSupport
                ? `$${candidate.nearestSupport.price.toFixed(2)}`
                : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/60 px-3 py-2">
            <p className="text-xs text-slate-500">Distance to Support</p>
            <p className="font-medium text-white">
              {formatPercent(candidate.distanceToSupport)}
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/60 px-3 py-2">
            <p className="text-xs text-slate-500">Historical Recovery</p>
            <p className="font-medium text-emerald-300">
              {formatPercent(candidate.historicalRecoveryRate * 100)}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 text-sm">
        <p className="text-slate-300">
          <span className="font-medium text-white">Entry: </span>
          {candidate.buyReason}
        </p>
        <p className="text-slate-500">
          <span className="font-medium text-slate-400">Buy timing method: </span>
          {candidate.predictionReason}
        </p>
      </div>

      <SellReasonList reasons={candidate.sellReasons} direction={candidate.direction} />

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-4 text-sm font-medium text-blue-400 transition hover:text-blue-300"
      >
        {expanded ? "Hide charts & dip history" : "View price charts"}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-700/60 pt-4">
          <div>
            <h4 className="mb-2 text-sm font-medium text-slate-400">
              Price with Support / Resistance
            </h4>
            <PriceChart
              history={candidate.history}
              intradayHistory={candidate.intradayHistory}
              resistanceLevels={candidate.resistanceLevels}
              supportLevels={candidate.supportLevels}
              symbol={candidate.symbol}
              heightClassName="h-56"
            />
          </div>

          {candidate.direction === "long" && candidate.pastDips.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-slate-400">
                Past Dip Recoveries
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/60 text-slate-500">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Dip</th>
                      <th className="py-2 pr-4 font-medium">Support</th>
                      <th className="py-2 pr-4 font-medium">Recovery Days</th>
                      <th className="py-2 pr-4 font-medium">10d Gain</th>
                      <th className="py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidate.pastDips.slice(0, 8).map((dip) => (
                      <tr
                        key={dip.date}
                        className="border-b border-slate-800 text-slate-400"
                      >
                        <td className="py-2 pr-4">{dip.date}</td>
                        <td className="py-2 pr-4">{formatPercent(dip.dipPercent)}</td>
                        <td className="py-2 pr-4">${dip.supportLevel.toFixed(2)}</td>
                        <td className="py-2 pr-4">{dip.recoveryDays}d</td>
                        <td
                          className={`py-2 pr-4 ${
                            dip.gain10d >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {(dip.gain10d * 100).toFixed(1)}%
                        </td>
                        <td className="py-2">
                          <span
                            className={
                              dip.recoveredFully ? "text-emerald-400" : "text-amber-400"
                            }
                          >
                            {dip.recoveredFully ? "Recovered" : "Partial"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function BestStocksPicker({
  active = true,
}: {
  active?: boolean;
}) {
  const [candidates, setCandidates] = useState<DipCandidate[]>([]);
  const candidatesRef = useRef<DipCandidate[]>([]);
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
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [timingFilter, setTimingFilter] = useState<TimingFilter>("all");
  const [showingSample, setShowingSample] = useState(false);
  const [sensitivity, setSensitivity] = useState<DipSensitivity>("balanced");
  const [scannedCount, setScannedCount] = useState<number | null>(null);

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  // Shared cached scan so a first-time visitor sees real results immediately
  // without spending their own scan budget.
  const loadSample = useCallback(async () => {
    setScanning(true);

    try {
      const response = await fetch("/api/dip-scanner/demo", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sample unavailable");

      setCandidates(data.candidates ?? []);
      setScannedCount(data.scanned ?? null);
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

  // Takes the level explicitly so a sensitivity button can rescan with its own
  // value instead of the stale one still captured in this closure.
  const handleScan = useCallback(async (level: DipSensitivity = sensitivity) => {
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

      const response = await fetch("/api/dip-scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ symbols, symbolsOnly, sensitivity: level }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Scan failed");
      }

      setCandidates(data.candidates ?? []);
      setScannedCount(data.scanned ?? null);
      setScannedAt(data.scannedAt ?? new Date().toISOString());
      setLiveUpdatedAt(data.scannedAt ?? new Date().toISOString());

      if (symbolsOnly && (data.candidates ?? []).length === 0) {
        setError(
          `No dip-buy or short setup found for ${symbols[0]} right now. Try another stock or scan the full market.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setCandidates([]);
      setScannedCount(null);
      setScannedAt(null);
      setLiveUpdatedAt(null);
    } finally {
      setScanning(false);
    }
  }, [searchQuery, selectedStock, sensitivity]);

  const refreshLive = useCallback(async () => {
    const current = candidatesRef.current;
    if (current.length === 0 || scanning || liveRefreshInFlight.current) return;

    // Each candidate carries its own price history, so the round trip grows with
    // the result count. Only the highest-ranked ones tick every second; the tail
    // holds its scan-time values until the next full scan.
    const live = current.slice(0, LIVE_REFRESH_LIMIT);
    const frozen = current.slice(LIVE_REFRESH_LIMIT);

    liveRefreshInFlight.current = true;
    setLiveRefreshing(true);

    try {
      const response = await fetch("/api/dip-scanner/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ candidates: live }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Live refresh failed");
      }

      setCandidates([...(data.candidates ?? live), ...frozen]);
      setLiveUpdatedAt(data.updatedAt ?? new Date().toISOString());
    } catch {
      // Keep last good data on tick failure.
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

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      if (directionFilter !== "all" && candidate.direction !== directionFilter) {
        return false;
      }
      return timingMatchesFilter(candidate.buyTiming, timingFilter);
    });
  }, [candidates, directionFilter, timingFilter]);

  const longCount = candidates.filter((c) => c.direction === "long").length;
  const shortCount = candidates.filter((c) => c.direction === "short").length;

  return (
    <div className="space-y-6">
      <LiveClock active={active} />

      <section className="surface-2 rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-white">Dips &amp; Shorts</h2>
              {showingSample && <DemoBadge label="Sample scan" />}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Scans for the biggest dips likely to bounce (longs) and breakdown /
              overextension setups (shorts). The top {LIVE_REFRESH_LIMIT} picks update
              live every second; the rest hold their scan-time values.
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
            placeholder="Search ticker or company (e.g. Tesla, NVDA)"
            disabled={scanning}
          />
          <button
            type="button"
            onClick={() => void handleScan()}
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
          Live updates every second for the top {LIVE_REFRESH_LIMIT} picks (price, dip
          %, scores, buy timing)
        </label>

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            How many setups to surface
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["strict", "Strict", "Only the strongest setups"],
                ["balanced", "Balanced", "Default screening"],
                ["broad", "Broad", "Include weaker, earlier setups"],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                title={hint}
                disabled={scanning}
                onClick={() => {
                  setSensitivity(value);
                  setShowingSample(false);
                  void handleScan(value);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  sensitivity === value
                    ? "bg-emerald-600 text-black"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Broad shows more names by accepting shallower dips and lower scores, so
            expect weaker signals alongside the good ones. Changing this reruns the
            scan.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["long", "Longs"],
              ["short", "Shorts"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setDirectionFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                directionFilter === value
                  ? "bg-blue-600 text-black"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["all", "Any timing"],
              ["tomorrow", "Buy / short tomorrow"],
              ["this_week", "This week"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTimingFilter(value)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                timingFilter === value
                  ? "bg-violet-600 text-black"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Predictions use RSI, support levels, and historical dip recovery patterns —
          educational estimates only, not financial advice. Safety stops are suggested
          limit-sell levels based on support, ATR, and volatility — not guaranteed fills.
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {scanning && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-8 text-center text-slate-500">
          Scanning for dip-buy and short opportunities with historical recovery data...
        </div>
      )}

      {!scanning && candidates.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Top Picks ({filteredCandidates.length} shown · {longCount} long ·{" "}
              {shortCount} short)
            </h3>
            {scannedCount !== null && (
              <p className="mt-1 text-xs text-slate-500">
                {candidates.length} setup{candidates.length === 1 ? "" : "s"} found
                across {scannedCount} symbols scanned.
                {sensitivity !== "broad" &&
                  " Switch to Broad to loosen the screen and see more."}
              </p>
            )}
          </div>
          {filteredCandidates.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="No picks match your filters"
              description="Try broadening the timing window or switching the direction filter back to all."
            />
          ) : (
            filteredCandidates.map((candidate) => (
              <DipCandidateCard
                key={`${candidate.symbol}-${candidate.direction}`}
                candidate={candidate}
              />
            ))
          )}
        </div>
      )}

      {!scanning && candidates.length === 0 && !error && (
        <EmptyState
          icon={Sparkles}
          title={scannedCount === null ? "No picks yet" : "Nothing cleared the screen"}
          description={
            scannedCount === null
              ? "Run a scan to rank long dip-buy and short opportunities by recovery score, with buy timing and predicted bounce dates."
              : `Scanned ${scannedCount} symbols and none met the ${sensitivity} threshold — common when the market is calm. Switch to Broad to see weaker setups.`
          }
        />
      )}
    </div>
  );
}
