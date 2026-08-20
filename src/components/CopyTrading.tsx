"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Landmark, Search, TriangleAlert } from "lucide-react";
import EmptyState from "./EmptyState";
import { Skeleton } from "./Skeleton";
import {
  NOTABLE_INVESTORS,
  isCongressFilerId,
  matchNotableInvestors,
  parseCongressFilerId,
} from "@/lib/thirteen-f-filers";
import type {
  CongressFilerReport,
  ThirteenFFilerReport,
  ThirteenFSearchHit,
  ThirteenFTradeAction,
} from "@/lib/types";

type DetailTab = "holdings" | "trades";
type LoadedReport = ThirteenFFilerReport | CongressFilerReport;

function isCongressReport(
  report: LoadedReport
): report is CongressFilerReport {
  return "kind" in report && report.kind === "congress";
}

function hitFromNotable(
  investor: (typeof NOTABLE_INVESTORS)[number]
): ThirteenFSearchHit {
  return {
    cik: investor.cik,
    name: investor.filerName,
    person: investor.person,
    source: investor.kind === "congress" ? "congress" : "notable",
    kind: investor.kind === "congress" ? "congress" : "13f",
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

export default function CopyTrading({ active = true }: { active?: boolean }) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ThirteenFSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedCik, setSelectedCik] = useState<string | null>(null);
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("holdings");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const loadFiler = useCallback(async (cik: string, label?: string) => {
    setSelectedCik(cik);
    setLoading(true);
    setError(null);
    setDetailTab("holdings");
    setDropdownOpen(false);
    if (label) setQuery(label);

    try {
      const congress = parseCongressFilerId(cik);
      const response = await fetch(
        congress
          ? `/api/copy-trading/congress?last=${encodeURIComponent(congress.last)}&first=${encodeURIComponent(congress.first)}`
          : `/api/copy-trading/${encodeURIComponent(cik)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ??
            (congress
              ? "Failed to load STOCK Act filings"
              : "Failed to load 13F")
        );
      }
      setReport(data);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Failed to load filing");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const highlighted =
    shownHits.length === 0
      ? 0
      : Math.min(activeIndex, shownHits.length - 1);

  function pickHit(hit: ThirteenFSearchHit) {
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
              Official filings for people you might actually type in the box —
              13F books for large US managers, and House STOCK Act reports for
              members of Congress (Pelosi does not file a 13F). Type a name and
              pick from the dropdown.
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
            Members of Congress file STOCK Act reports, not 13F.
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
              placeholder="Nancy, Buffett, Ackman, Burry, Citadel…"
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
          {dropdownOpen && shownHits.length > 0 && (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl"
            >
              {shownHits.map((hit, index) => {
                const congress =
                  hit.kind === "congress" || isCongressFilerId(hit.cik);
                return (
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
                        {congress
                          ? "STOCK Act"
                          : hit.source === "edgar"
                            ? "EDGAR"
                            : "13F"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {query.trim().length >= 2 && searching && (
            <p className="mt-2 text-xs text-slate-500">
              Checking EDGAR and House filings…
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
            const congress = investor.kind === "congress";
            return (
              <button
                key={investor.cik}
                type="button"
                onClick={() => void loadFiler(investor.cik, investor.person)}
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
                {congress && (
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-600">
                    STOCK Act · not 13F
                  </p>
                )}
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
          description="Type a name — Nancy, Buffett, Ackman — and pick from the dropdown, or tap a person above."
        />
      )}

      {report && !loading && isCongressReport(report) && (
        <section className="surface-2 overflow-hidden rounded-2xl">
          <div className="border-b border-slate-800 px-5 py-4">
            <p className="text-lg font-semibold text-white">{report.person}</p>
            <p className="text-sm text-slate-400">{report.filerName}</p>
            {report.district && (
              <p className="mt-1 text-xs text-slate-500">
                District {report.district}
              </p>
            )}
            <p className="mt-2 text-sm text-slate-400">
              Members of Congress do not file 13F. These are Periodic
              Transaction Reports from the Clerk of the House. Tickers and
              dollar ranges are in the PDF — this list is the filing index.
            </p>
            <a
              href={report.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
            >
              House financial disclosure search
            </a>
          </div>
          {report.filings.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">
              No periodic transaction reports in the current Clerk index.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Filed</th>
                    <th className="px-3 py-2.5 font-medium">Type</th>
                    <th className="px-3 py-2.5 font-medium">Document</th>
                    <th className="px-4 py-2.5 text-right font-medium">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {report.filings.map((filing) => (
                    <tr
                      key={filing.docId + filing.filingDate}
                      className="border-b border-slate-800/80"
                    >
                      <td className="px-4 py-2.5 tabular-nums text-slate-200">
                        {filing.filingDate}
                      </td>
                      <td className="px-3 py-2.5 text-slate-300">
                        {filing.filingType}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-400">
                        {filing.docId}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <a
                          href={filing.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-400 hover:text-blue-300"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {report && !loading && !isCongressReport(report) && (
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
            </p>
            <a
              href={report.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300"
            >
              View filing on SEC EDGAR
            </a>
          </div>

          <div className="flex gap-1 border-b border-slate-800 p-1">
            {(
              [
                ["holdings", "Holdings"],
                ["trades", "Changes vs prior 13F"],
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

          {detailTab === "holdings" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Issuer</th>
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
                      className="border-b border-slate-800/80"
                    >
                      <td className="px-4 py-2.5">
                        <p className="text-slate-100">{row.issuer}</p>
                        <p className="text-xs text-slate-500">
                          {row.titleOfClass}
                          {row.putCall ? ` · ${row.putCall}` : ""}
                        </p>
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
              {report.holdingCount > report.holdings.length && (
                <p className="border-t border-slate-800 px-4 py-2.5 text-xs text-slate-500">
                  Showing the {report.holdings.length} largest of{" "}
                  {report.holdingCount.toLocaleString()} positions by reported
                  value.
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
                    <th className="px-3 py-2.5 font-medium">Issuer</th>
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
                      className="border-b border-slate-800/80"
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
                        <p className="text-slate-100">{trade.issuer}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {trade.cusip}
                          {trade.putCall ? ` · ${trade.putCall}` : ""}
                        </p>
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
                  {report.tradeCount > report.trades.length
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
