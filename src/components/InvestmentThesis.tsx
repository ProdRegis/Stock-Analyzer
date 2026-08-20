"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, TriangleAlert } from "lucide-react";
import BusinessQualityBadge from "./BusinessQualityBadge";
import EmptyState from "./EmptyState";
import StockSearchInput, { resolveStockQuery } from "./StockSearchInput";
import { Skeleton } from "./Skeleton";
import { usePersistentStore } from "@/hooks/usePersistentStore";
import { rememberThesis, recentThesesStore } from "@/lib/tab-memory";
import type {
  InvestmentThesis as Thesis,
  MarketSearchResult,
  ThesisStance,
} from "@/lib/types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatCash(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

const stanceCopy: Record<
  ThesisStance,
  { label: string; className: string }
> = {
  buy: {
    label: "Buy zone",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  wait: {
    label: "Wait for a better price",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  },
  "hold-study": {
    label: "Study, don't buy",
    className: "border-slate-600/60 bg-slate-800/60 text-slate-200",
  },
  pass: {
    label: "Pass",
    className: "border-red-500/30 bg-red-500/10 text-red-200",
  },
};

const flagTone: Record<"good" | "warn" | "bad", string> = {
  good: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-200 border-amber-500/20",
  bad: "bg-red-500/10 text-red-300 border-red-500/20",
};

function ThesisSkeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-label="Building investment thesis"
    >
      <div className="surface-2 rounded-2xl p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <p className="text-center text-sm text-slate-500">
        Reading filings snapshots and tying a reverse DCF to the live price…
      </p>
    </div>
  );
}

function ThesisReport({
  thesis,
  onOpenPeer,
}: {
  thesis: Thesis;
  onOpenPeer: (symbol: string) => void;
}) {
  const stance = stanceCopy[thesis.plan.stance];

  return (
    <div className="space-y-6">
      <section className="surface-1 rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-white">
                {thesis.symbol}
              </h2>
              <BusinessQualityBadge quality={thesis.quality} />
              <span
                className={`rounded-full border px-3 py-1 text-sm font-medium ${stance.className}`}
              >
                {stance.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-400">{thesis.name}</p>
            {(thesis.sector || thesis.industry) && (
              <p className="mt-1 text-xs text-slate-500">
                {[thesis.sector, thesis.industry].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-white">
              {formatCurrency(thesis.currentPrice)}
            </p>
            <p className="text-xs text-slate-500">Live price</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">
          {thesis.thesis}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          {thesis.quality.summary}
        </p>

        {thesis.screen.flags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {thesis.screen.flags.map((flag) => (
              <span
                key={flag.label}
                className={`rounded-full border px-2.5 py-1 text-xs ${flagTone[flag.tone]}`}
              >
                {flag.label}
              </span>
            ))}
          </div>
        )}

        {thesis.screen.kickOut && thesis.screen.kickOutReason && (
          <p className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {thesis.screen.kickOutReason}
          </p>
        )}

        {thesis.quality.hardIndustry && (
          <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            This industry is easy to misunderstand. Do not proceed past this
            screen unless you already know the product — the rest of the
            write-up will not teach you the science.
          </p>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
            When to buy
          </p>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100">
            {thesis.plan.whenToBuy}
          </p>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
            {thesis.plan.buyAt != null
              ? formatCurrency(thesis.plan.buyAt)
              : "—"}
          </p>
          <p className="text-xs text-slate-500">Buy at</p>
        </div>
        <div className="rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-orange-400">
            When to sell
          </p>
          <p className="mt-2 text-sm leading-relaxed text-orange-100">
            {thesis.plan.whenToSell}
          </p>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
            {thesis.plan.sellAt != null
              ? formatCurrency(thesis.plan.sellAt)
              : "—"}
          </p>
          <p className="text-xs text-slate-500">Sell / trim at</p>
        </div>
      </section>

      <section className="surface-2 rounded-2xl p-5">
        <h3 className="text-sm font-medium uppercase tracking-wide text-slate-400">
          Tied to numbers
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-800/60 px-3 py-2.5">
            <p className="text-xs text-slate-500">Implied return</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">
              {thesis.valuation.impliedReturn != null
                ? formatPct(thesis.valuation.impliedReturn)
                : "—"}
            </p>
            <p className="text-[11px] text-slate-500">
              What this price already assumes
            </p>
          </div>
          <div className="rounded-xl bg-slate-800/60 px-3 py-2.5">
            <p className="text-xs text-slate-500">Hurdle</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">
              {formatPct(thesis.valuation.hurdleRate)}
            </p>
            <p className="text-[11px] text-slate-500">
              Treasury + 8% (buy bar)
            </p>
          </div>
          <div className="rounded-xl bg-slate-800/60 px-3 py-2.5">
            <p className="text-xs text-slate-500">Conservative growth</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">
              {thesis.valuation.conservativeGrowth != null
                ? formatPct(thesis.valuation.conservativeGrowth)
                : "—"}
            </p>
            <p className="text-[11px] text-slate-500">
              Haircut reported growth, fade to 2.5%
            </p>
          </div>
          <div className="rounded-xl bg-slate-800/60 px-3 py-2.5">
            <p className="text-xs text-slate-500">Starting cash flow</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-white">
              {thesis.valuation.startingCashFlow != null
                ? formatCash(thesis.valuation.startingCashFlow)
                : "—"}
            </p>
            <p className="text-[11px] text-slate-500">
              {thesis.valuation.method === "fcf"
                ? "Trailing free cash flow"
                : thesis.valuation.method === "earnings"
                  ? "Trailing earnings (FCF unused)"
                  : "None usable"}
            </p>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          {thesis.valuation.explanation}
        </p>

        {thesis.valuation.scenarios.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {thesis.valuation.scenarios.map((row) => (
              <div
                key={row.id}
                className={`rounded-xl px-3 py-2.5 ${
                  row.id === "conservative"
                    ? "border border-blue-500/30 bg-blue-500/10"
                    : "bg-slate-800/40"
                }`}
              >
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  {row.label}
                </p>
                <p className="mt-1 text-sm font-medium tabular-nums text-white">
                  {formatPct(row.growth)} growth
                </p>
                <p className="text-xs tabular-nums text-slate-400">
                  Implied{" "}
                  {row.impliedReturn != null
                    ? formatPct(row.impliedReturn)
                    : "—"}
                  {row.buyPrice != null
                    ? ` · buy ${formatCurrency(row.buyPrice)}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}

        {thesis.valuation.schedule && thesis.valuation.schedule.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">Year</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Growth</th>
                  <th className="py-1.5 pr-3 text-right font-medium">
                    Cash flow
                  </th>
                  <th className="py-1.5 text-right font-medium">PV</th>
                </tr>
              </thead>
              <tbody>
                {thesis.valuation.schedule.map((row) => (
                  <tr key={row.year} className="border-b border-slate-800/70">
                    <td className="py-1.5 pr-3 text-slate-300">{row.year}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-300">
                      {formatPct(row.growth)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-200">
                      {formatCash(row.cashFlow)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-white">
                      {formatCash(row.presentValue)}
                    </td>
                  </tr>
                ))}
                {thesis.valuation.terminalPresentValue != null && (
                  <tr>
                    <td className="py-1.5 pr-3 text-slate-400" colSpan={3}>
                      Terminal value (PV)
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-white">
                      {formatCash(thesis.valuation.terminalPresentValue)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-slate-500">
              Discounted at the implied return so present value matches the
              market value used in the model.
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">Create value</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {thesis.createValue}
          </p>
        </div>
        <div className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">Capture value</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {thesis.captureValue}
          </p>
        </div>
        <div className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">Protect value</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            {thesis.protectValue}
          </p>
        </div>
      </section>

      <section className="surface-2 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-slate-200">
          Try to break the thesis
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          If you cannot knock it down, confidence goes up. Rabbit holes that go
          nowhere are part of the job.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-300">
          {thesis.bearCase.map((item) => (
            <li key={item} className="leading-relaxed">
              {item}
            </li>
          ))}
        </ol>
      </section>

      {thesis.peers.length > 0 && (
        <section className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">
            Other names in this group
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Not buy alerts — the same industry, so you can compare how each one
            creates, captures, and protects value.
          </p>
          <ul className="mt-3 divide-y divide-slate-800">
            {thesis.peers.map((peer) => (
              <li
                key={peer.symbol}
                className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <button
                    type="button"
                    onClick={() => onOpenPeer(peer.symbol)}
                    className="font-medium text-white transition hover:text-blue-300"
                  >
                    {peer.symbol}{" "}
                    <span className="font-normal text-slate-500">
                      {peer.name}
                    </span>
                  </button>
                  <p className="mt-1 text-xs text-slate-500">{peer.note}</p>
                </div>
                {peer.grade && (
                  <BusinessQualityBadge
                    quality={{
                      grade: peer.grade,
                      summary: peer.note,
                      flags: [],
                      hardIndustry: false,
                    }}
                    size="sm"
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {thesis.notableHolders.length > 0 && (
        <section className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">
            Also in concentrated 13Fs
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Among stock-pickers in Copy Trading — not giant multi-strategy
            books. Weight is that manager&apos;s reported long-book share.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {thesis.notableHolders.map((holder) => (
              <li
                key={holder.cik}
                className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-xs text-slate-200"
              >
                {holder.person}
                <span className="ml-1.5 text-slate-500">
                  {(holder.weight * 100).toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        Informational only — not financial advice. A thesis here is a structured
        reading of public filings snapshots and a reverse DCF, not a substitute
        for a 10-K. Sources: {thesis.sources.join("; ")}.
      </p>
    </div>
  );
}

export default function InvestmentThesis({
  requestedSymbol,
  requestedAt,
}: {
  requestedSymbol?: string | null;
  requestedAt?: number;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<MarketSearchResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thesis, setThesis] = useState<Thesis | null>(null);

  const recents = usePersistentStore(recentThesesStore);

  const loadThesis = useCallback(async (symbol: string, name?: string) => {
    setLoading(true);
    setError(null);
    setSearchQuery(name ? `${symbol} — ${name}` : symbol);

    try {
      const response = await fetch(
        `/api/thesis/${encodeURIComponent(symbol)}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Thesis failed");
      }
      const next = data as Thesis;
      setThesis(next);
      rememberThesis({
        symbol: next.symbol,
        name: next.name,
        stance: next.plan.stance,
        buyAt: next.plan.buyAt,
        at: Date.now(),
      });
      setSelectedStock({
        symbol: next.symbol,
        name: next.name,
        exchange: "—",
        type: "Equity",
      });
      setSearchQuery(`${next.symbol} — ${next.name}`);
    } catch (err) {
      setThesis(null);
      setError(err instanceof Error ? err.message : "Thesis failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const symbol = requestedSymbol?.trim().toUpperCase();
    if (!symbol || requestedAt == null) return;
    void loadThesis(symbol);
  }, [requestedSymbol, requestedAt, loadThesis]);

  const handleGenerate = useCallback(async () => {
    try {
      const resolved = await resolveStockQuery(searchQuery, selectedStock);
      if (!resolved) {
        throw new Error(
          "No stock found. Pick a company from the dropdown or enter a valid ticker."
        );
      }
      await loadThesis(resolved.symbol, resolved.name);
    } catch (err) {
      setThesis(null);
      setError(err instanceof Error ? err.message : "Thesis failed");
    }
  }, [searchQuery, selectedStock, loadThesis]);

  return (
    <div className="space-y-6">
      <section className="surface-2 rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-white">Investment Thesis</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search a stock. The write-up follows a research process used by
          professional analysts: kick out what you cannot underwrite, ask how
          the business creates, captures, and protects value, then tie a simple
          thesis to a reverse DCF — buy when conservative cash flows already
          imply a high return, sell when the price no longer does.
        </p>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void handleGenerate();
          }}
        >
          <StockSearchInput
            className="flex-1"
            value={searchQuery}
            onChange={setSearchQuery}
            selected={selectedStock}
            onSelect={setSelectedStock}
            onClearSelection={() => setSelectedStock(null)}
            placeholder="Search ticker or company (e.g. Chipotle, AAPL)"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Building…" : "Build thesis"}
          </button>
        </form>
      </section>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {loading && <ThesisSkeleton />}

      {!loading && !thesis && !error && (
        <div className="space-y-4">
          {recents.length > 0 && (
            <section className="surface-2 rounded-2xl p-5">
              <h3 className="text-sm font-medium text-slate-300">
                Recent theses
              </h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {recents.map((row) => (
                  <li key={row.symbol}>
                    <button
                      type="button"
                      onClick={() => void loadThesis(row.symbol, row.name)}
                      className="rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-left text-xs text-slate-200 transition hover:border-blue-500/40 hover:text-white"
                    >
                      <span className="font-medium text-white">{row.symbol}</span>
                      <span className="ml-1.5 text-slate-500">
                        {stanceCopy[row.stance].label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <EmptyState
            icon={BookOpen}
            title="No thesis yet"
            description="Pick a company you think you understand. The goal is a plain-vanilla write-up you could defend, not a clever one-off trade."
          />
        </div>
      )}

      {!loading && thesis && (
        <ThesisReport
          thesis={thesis}
          onOpenPeer={(symbol) => {
            void loadThesis(symbol);
          }}
        />
      )}
    </div>
  );
}
