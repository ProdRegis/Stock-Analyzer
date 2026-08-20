"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Landmark, Search, TriangleAlert } from "lucide-react";
import EmptyState from "./EmptyState";
import OpenThesisButton from "./OpenThesisButton";
import { Skeleton } from "./Skeleton";
import {
  NOTABLE_INVESTORS,
  matchNotableInvestors,
} from "@/lib/thirteen-f-filers";
import { lastCopyTraderStore } from "@/lib/tab-memory";
import type {
  ThirteenFFilerReport,
  ThirteenFSearchHit,
  ThirteenFTradeAction,
} from "@/lib/types";

type DetailTab = "holdings" | "trades";

function hitFromNotable(
  investor: (typeof NOTABLE_INVESTORS)[number]
): ThirteenFSearchHit {
  return {
    cik: investor.cik,
    name: investor.filerName,
    person: investor.person,
    source: "notable",
  };
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

function formatShares(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toLocaleString()}`;
}

function quarterLabel(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return iso;
  return `Q${Math.ceil(month / 3)} ${year}`;
}

const actionStyles: Record<ThirteenFTradeAction, string> = {
  opened: "bg-emerald-500/15 text-emerald-300",
  added: "bg-blue-500/15 text-blue-300",
  reduced: "bg-amber-500/15 text-amber-200",
  exited: "bg-red-500/15 text-red-300",
};

const actionLabels: Record<ThirteenFTradeAction, string> = {
  opened: "Opened",
  added: "Added",
  reduced: "Cut",
  exited: "Exited",
};

function ownedSet(symbols: string[]): Set<string> {
  return new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean));
}

function NameCell({
  issuer,
  detail,
  ticker,
  owned,
  onOpenThesis,
}: {
  issuer: string;
  detail?: string;
  ticker: string | null;
  owned: boolean;
  onOpenThesis?: (symbol: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0">
        <p className="text-slate-100">
          {ticker ?? issuer}
          {owned && (
            <span className="ml-2 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-medium text-blue-300">
              You hold
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {ticker ? issuer : detail}
          {ticker && detail ? ` · ${detail}` : ""}
        </p>
      </div>
      {ticker && onOpenThesis && (
        <OpenThesisButton symbol={ticker} onOpen={onOpenThesis} />
      )}
    </div>
  );
}

export default function CopyTrading({
  active = true,
  portfolioSymbols = [],
  onOpenThesis,
}: {
  active?: boolean;
  portfolioSymbols?: string[];
  onOpenThesis?: (symbol: string) => void;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ThirteenFSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCik, setSelectedCik] = useState<string | null>(null);
  const [report, setReport] = useState<ThirteenFFilerReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("trades");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [bookQuery, setBookQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const portfolioOwned = useMemo(
    () => ownedSet(portfolioSymbols),
    [portfolioSymbols]
  );

  const loadFiler = useCallback(
    async (
      cik: string,
      label?: string,
      options?: { bookQuery?: string; keepTab?: boolean }
    ) => {
      setSelectedCik(cik);
      setLoading(true);
      setError(null);
      if (!options?.keepTab) setDetailTab("trades");
      setDropdownOpen(false);
      if (label) setQuery(label);

      const q = options?.bookQuery ?? "";
      const url = q.trim()
        ? `/api/copy-trading/${encodeURIComponent(cik)}?q=${encodeURIComponent(q.trim())}`
        : `/api/copy-trading/${encodeURIComponent(cik)}`;

      try {
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load 13F");
        }
        setReport(data);
        if (label) {
          lastCopyTraderStore.set({ cik, label });
        }
      } catch (err) {
        setReport(null);
        setError(err instanceof Error ? err.message : "Failed to load filing");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const localHits = useMemo(
    () => matchNotableInvestors(query).map(hitFromNotable),
    [query]
  );

  const shownHits = useMemo(() => {
    const seen = new Set(localHits.map((hit) => hit.cik));
    const remote =
      query.trim().length >= 2
        ? hits.filter((hit) => !seen.has(hit.cik))
        : [];
    return [...localHits, ...remote].slice(0, 12);
  }, [hits, localHits, query]);

  useEffect(() => {
    if (!active) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/copy-trading/search?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Search failed");
        setHits(data.results ?? []);
        setSearchError(null);
      } catch (err) {
        setHits([]);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query, active]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!active || restored.current) return;
    restored.current = true;
    const last = lastCopyTraderStore.getSnapshot();
    if (last?.cik) {
      void loadFiler(last.cik, last.label);
    }
  }, [active, loadFiler]);

  const bookQuerySynced = useRef(bookQuery);

  useEffect(() => {
    if (!selectedCik) return;
    if (bookQuerySynced.current === bookQuery) return;
    bookQuerySynced.current = bookQuery;
    const timer = window.setTimeout(() => {
      void loadFiler(selectedCik, undefined, {
        bookQuery,
        keepTab: true,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [bookQuery, selectedCik, loadFiler]);

  const overlapTickers = useMemo(() => {
    if (!report) return [];
    const found = new Set<string>();
    for (const row of [...report.holdings, ...report.trades, ...report.opened]) {
      const ticker = row.ticker?.toUpperCase();
      if (ticker && portfolioOwned.has(ticker)) found.add(ticker);
    }
    return [...found];
  }, [report, portfolioOwned]);

  const highlighted =
    shownHits.length === 0
      ? 0
      : Math.min(activeIndex, shownHits.length - 1);

  function pickHit(hit: ThirteenFSearchHit) {
    setBookQuery("");
    void loadFiler(hit.cik, hit.person ?? hit.name);
  }

  return (
    <div className="space-y-6">
      <section className="surface-2 rounded-2xl p-5">
        <div className="flex flex-wrap items-start gap-2">
          <Landmark className="mt-0.5 h-5 w-5 text-slate-500" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-white">Copy Trading</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Latest SEC Form 13F holdings for large US managers. Type a name
              and pick from the dropdown — only filers with a parseable 13F
              book are listed.
            </p>
          </div>
        </div>

        <ul className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
          <li>
            Filed up to 45 days after quarter-end, so this is last quarter’s
            snapshot, not live trades.
          </li>
          <li>
            Long US-listed equities only. No shorts, options books as a whole,
            bonds, cash, or crypto.
          </li>
          <li>
            “Trades” are the change versus the prior 13F, not the day they
            actually bought or sold.
          </li>
          <li>
            Famous people usually file through a firm. Buffett → Berkshire.
          </li>
        </ul>

        <div ref={boxRef} className="relative mt-5">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Search a person, fund, or CIK
            </span>
            <input
              type="search"
              value={query}
              role="combobox"
              aria-expanded={dropdownOpen}
              aria-controls={listboxId}
              aria-autocomplete="list"
              autoComplete="off"
              onFocus={() => setDropdownOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setDropdownOpen(true);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setDropdownOpen(true);
                  setActiveIndex((current) =>
                    shownHits.length === 0
                      ? 0
                      : (current + 1) % shownHits.length
                  );
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    shownHits.length === 0
                      ? 0
                      : (current - 1 + shownHits.length) % shownHits.length
                  );
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const hit = shownHits[highlighted] ?? shownHits[0];
                  if (hit) pickHit(hit);
                  return;
                }
                if (event.key === "Escape") {
                  setDropdownOpen(false);
                }
              }}
              placeholder="Buffett, Ackman, Burry, Citadel…"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          {dropdownOpen && shownHits.length > 0 && (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl"
            >
              {shownHits.map((hit, index) => (
                <li key={hit.cik} role="option" aria-selected={index === highlighted}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => pickHit(hit)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${
                      index === highlighted ? "bg-slate-800" : "hover:bg-slate-800/60"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-medium text-white">
                        {hit.person ?? hit.name}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {hit.person ? hit.name : `CIK ${hit.cik}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-600">
                      {hit.source === "edgar" ? "EDGAR" : "13F"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && searching && (
            <p className="mt-2 text-xs text-slate-500">
              Checking EDGAR…
            </p>
          )}
          {query.trim().length >= 2 && searchError && (
            <p className="mt-2 text-xs text-red-300">{searchError}</p>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-slate-300">
          People you can look up
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {NOTABLE_INVESTORS.map((investor) => {
            const selected = selectedCik === investor.cik;
            return (
              <button
                key={investor.cik}
                type="button"
                onClick={() => {
                  setBookQuery("");
                  void loadFiler(investor.cik, investor.person);
                }}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  selected
                    ? "border-blue-500/40 bg-blue-500/10"
                    : "border-slate-800 bg-slate-900/40 hover:border-slate-600 hover:bg-slate-800/40"
                }`}
              >
                <p className="text-sm font-medium text-white">
                  {investor.person}
                </p>
                <p className="text-xs text-slate-500">{investor.filerName}</p>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3" role="status" aria-label="Loading 13F">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      )}

      {!loading && !report && !error && (
        <EmptyState
          icon={Landmark}
          title="Pick a manager to see the filing"
          description="Type a name — Buffett, Ackman — and pick from the dropdown, or tap a person above."
        />
      )}

      {report && !loading && (
        <section className="surface-2 overflow-hidden rounded-2xl">
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="text-lg font-semibold text-white">
              {report.person ?? report.filerName}
            </p>
            {report.person && (
              <p className="text-sm text-slate-400">{report.filerName}</p>
            )}
            <p className="mt-2 text-sm text-slate-400">
              {quarterLabel(report.period.reportDate)} holdings · filed{" "}
              {report.period.filingDate} · {report.holdingCount.toLocaleString()}{" "}
              positions · {formatUsd(report.totalValueUsd)} reported long book
              {report.openedCount > 0
                ? ` · ${report.openedCount} new this quarter`
                : ""}
            </p>
            <a
              href={report.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
            >
              View filing on SEC EDGAR
            </a>
            {overlapTickers.length > 0 && (
              <p className="mt-3 rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 py-2 text-sm text-blue-100">
                You hold {overlapTickers.length} of these names:{" "}
                {overlapTickers.join(", ")}
              </p>
            )}
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Search this book
              </span>
              <input
                type="search"
                value={bookQuery}
                onChange={(event) => setBookQuery(event.target.value)}
                placeholder="Issuer, ticker, or CUSIP — including names outside the top 50"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>
            {report.matchCount != null && (
              <p className="mt-2 text-xs text-slate-500">
                {report.matchCount === 0
                  ? `No holdings match “${report.query}”.`
                  : `${report.matchCount.toLocaleString()} holdings match “${report.query}”.`}
              </p>
            )}
          </div>

          <div className="flex gap-1 border-b border-slate-800 p-1">
            {(
              [
                ["trades", "Changes vs prior 13F"],
                ["holdings", "Holdings"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDetailTab(id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  detailTab === id
                    ? "bg-blue-600 text-black"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {label}
                {id === "trades" ? ` (${report.tradeCount})` : ""}
              </button>
            ))}
          </div>

          {detailTab === "trades" &&
            report.opened.length > 0 &&
            !report.query && (
              <div className="border-b border-slate-800 px-5 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                  New this quarter
                </p>
                <ul className="mt-2 space-y-2">
                  {report.opened.map((trade) => (
                    <li
                      key={"opened-pin-" + trade.cusip + (trade.putCall ?? "")}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <NameCell
                        issuer={trade.issuer}
                        detail={trade.putCall ? trade.putCall : undefined}
                        ticker={trade.ticker}
                        owned={Boolean(
                          trade.ticker &&
                            portfolioOwned.has(trade.ticker.toUpperCase())
                        )}
                        onOpenThesis={onOpenThesis}
                      />
                      <span className="text-sm tabular-nums text-slate-200">
                        {formatUsd(trade.valueChangeUsd)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          {detailTab === "holdings" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 font-medium">CUSIP</th>
                    <th className="px-3 py-2.5 text-right font-medium">Shares</th>
                    <th className="px-3 py-2.5 text-right font-medium">Value</th>
                    <th className="px-4 py-2.5 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {report.holdings.map((row) => (
                    <tr
                      key={row.cusip + (row.putCall ?? "")}
                      className={`border-b border-slate-800/80 ${
                        row.ticker &&
                        portfolioOwned.has(row.ticker.toUpperCase())
                          ? "bg-blue-500/5"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <NameCell
                          issuer={row.issuer}
                          detail={`${row.titleOfClass}${row.putCall ? ` · ${row.putCall}` : ""}`}
                          ticker={row.ticker}
                          owned={Boolean(
                            row.ticker &&
                              portfolioOwned.has(row.ticker.toUpperCase())
                          )}
                          onOpenThesis={onOpenThesis}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-400">
                        {row.cusip}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">
                        {formatShares(row.shares).replace(/^\+/, "")}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-white">
                        {formatUsd(row.valueUsd)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-300">
                        {(row.weight * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.matchCount == null &&
                report.holdingCount > report.holdings.length && (
                <p className="border-t border-slate-800 px-4 py-2.5 text-xs text-slate-500">
                  Showing the {report.holdings.length} largest of{" "}
                  {report.holdingCount.toLocaleString()} positions by reported
                  value. Search the book to reach names outside this slice.
                </p>
              )}
            </div>
          ) : report.trades.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">
              {report.previousPeriod
                ? "Share counts match the prior 13F, so there is no inferred trade list."
                : "Need a prior 13F to infer what changed."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Action</th>
                    <th className="px-3 py-2.5 font-medium">Name</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Share change
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      Value change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.trades.map((trade) => (
                    <tr
                      key={trade.action + trade.cusip + (trade.putCall ?? "")}
                      className={`border-b border-slate-800/80 ${
                        trade.ticker &&
                        portfolioOwned.has(trade.ticker.toUpperCase())
                          ? "bg-blue-500/5"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                            actionStyles[trade.action]
                          }`}
                        >
                          {actionLabels[trade.action]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <NameCell
                          issuer={trade.issuer}
                          detail={`${trade.cusip}${trade.putCall ? ` · ${trade.putCall}` : ""}`}
                          ticker={trade.ticker}
                          owned={Boolean(
                            trade.ticker &&
                              portfolioOwned.has(trade.ticker.toUpperCase())
                          )}
                          onOpenThesis={onOpenThesis}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">
                        {formatShares(trade.shareChange)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-white">
                        {formatUsd(trade.valueChangeUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.previousPeriod && (
                <p className="border-t border-slate-800 px-4 py-2.5 text-xs text-slate-500">
                  Compared with {quarterLabel(report.previousPeriod.reportDate)}{" "}
                  (filed {report.previousPeriod.filingDate}). Not the trade
                  dates.
                  {report.matchCount == null &&
                  report.tradeCount > report.trades.length
                    ? ` Showing the ${report.trades.length} largest of ${report.tradeCount.toLocaleString()} share changes.`
                    : ""}
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
