"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import EmptyState from "./EmptyState";
import PriceChart from "./PriceChart";
import StockSearchInput, { resolveStockQuery } from "./StockSearchInput";
import { formatMarketState } from "@/lib/format";
import type { MarketCompanyDetails, MarketSearchResult } from "@/lib/types";

interface LiveMarketModalProps {
  open: boolean;
  onClose: () => void;
}

function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatLargeNumber(value: number | null) {
  if (value == null) return "—";
  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  }
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  return value.toLocaleString();
}

function formatVolume(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString();
}

export default function LiveMarketModal({ open, onClose }: LiveMarketModalProps) {
  const [query, setQuery] = useState("");
  const [selectedSearch, setSelectedSearch] = useState<MarketSearchResult | null>(
    null
  );
  const [selected, setSelected] = useState<MarketCompanyDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCompany = useCallback(async (symbol: string) => {
    setLoadingDetails(true);
    setError(null);

    try {
      const response = await fetch(`/api/market/${symbol}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load company data");
      }

      setSelected(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load company");
      setSelected(null);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const handleSearch = useCallback(async () => {
    setError(null);

    try {
      const resolved = await resolveStockQuery(query, selectedSearch);
      if (!resolved) {
        throw new Error(
          "No stock found. Pick a company from the dropdown or enter a valid ticker."
        );
      }
      setSelectedSearch(resolved);
      setQuery(`${resolved.symbol} — ${resolved.name}`);
      await loadCompany(resolved.symbol);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setSelected(null);
    }
  }, [loadCompany, query, selectedSearch]);

  useEffect(() => {
    if (!open || !selected) return;

    const interval = setInterval(() => {
      loadCompany(selected.symbol);
    }, 60_000);

    return () => clearInterval(interval);
  }, [open, selected, loadCompany]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close live market"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Live Market</h2>
            <p className="text-sm text-slate-500">
              Search any ticker or company for real-time quotes and details
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-sm text-slate-400 transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <StockSearchInput
              className="flex-1"
              value={query}
              onChange={setQuery}
              selected={selectedSearch}
              onSelect={(result) => {
                setSelectedSearch(result);
                setQuery(`${result.symbol} — ${result.name}`);
                loadCompany(result.symbol);
              }}
              onClearSelection={() => setSelectedSearch(null)}
              placeholder="Search ticker or company (e.g. AAPL, Tesla, Microsoft)"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={loadingDetails}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loadingDetails ? "Loading..." : "Search"}
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {loadingDetails && (
            <div className="rounded-xl border border-slate-700/60 bg-slate-900 px-4 py-10 text-center text-slate-500">
              Loading live market data...
            </div>
          )}

          {!loadingDetails && !selected && !error && (
            <EmptyState
              icon={Search}
              title="Search for a stock"
              description="Look up any ticker or company to see live price, company info, and today's intraday chart."
            />
          )}

          {!loadingDetails && selected && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-semibold text-white">
                      {selected.symbol}
                    </h3>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                      {formatMarketState(selected.marketState)}
                    </span>
                  </div>
                  <p className="text-slate-500">{selected.name}</p>
                  {selected.marketTime && (
                    <p className="mt-1 text-xs text-slate-500">
                      Last updated{" "}
                      {new Date(selected.marketTime).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-3xl font-semibold text-white">
                    {formatCurrency(selected.currentPrice, selected.currency)}
                  </p>
                  <p
                    className={`text-sm font-medium ${
                      selected.changePercent >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {selected.change >= 0 ? "+" : ""}
                    {formatCurrency(selected.change, selected.currency)} (
                    {selected.changePercent >= 0 ? "+" : ""}
                    {selected.changePercent.toFixed(2)}%)
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Open", value: selected.open != null ? formatCurrency(selected.open, selected.currency) : "—" },
                  { label: "Day High", value: selected.dayHigh != null ? formatCurrency(selected.dayHigh, selected.currency) : "—" },
                  { label: "Day Low", value: selected.dayLow != null ? formatCurrency(selected.dayLow, selected.currency) : "—" },
                  { label: "Volume", value: formatVolume(selected.volume) },
                  { label: "Market Cap", value: formatLargeNumber(selected.marketCap) },
                  { label: "P/E Ratio", value: selected.peRatio?.toFixed(2) ?? "—" },
                  {
                    label: "52W High",
                    value: selected.fiftyTwoWeekHigh != null ? formatCurrency(selected.fiftyTwoWeekHigh, selected.currency) : "—",
                  },
                  {
                    label: "52W Low",
                    value: selected.fiftyTwoWeekLow != null ? formatCurrency(selected.fiftyTwoWeekLow, selected.currency) : "—",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-3 py-3"
                  >
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="mt-1 font-medium text-white">{item.value}</p>
                  </div>
                ))}
              </div>

              {(selected.sector || selected.industry) && (
                <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
                  {[selected.sector, selected.industry].filter(Boolean).join(" · ")}
                  {selected.website && (
                    <>
                      {" · "}
                      <a
                        href={selected.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Website
                      </a>
                    </>
                  )}
                </div>
              )}

              {selected.summary && (
                <p className="text-sm leading-6 text-slate-500">{selected.summary}</p>
              )}

              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-400">
                  Today&apos;s Intraday Chart (1-minute bars)
                </h4>
                {selected.intradayHistory.length > 0 ? (
                  <PriceChart
                    history={selected.intradayHistory}
                    symbol={selected.symbol}
                    mode="intraday"
                    showMovingAverages={false}
                    heightClassName="h-64"
                  />
                ) : (
                  <p className="text-sm text-slate-500">
                    Intraday data is not available right now.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
