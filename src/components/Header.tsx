"use client";

import { useEffect, useState } from "react";
import { ChartCandlestick } from "lucide-react";
import LiveMarketModal from "./LiveMarketModal";
import { formatMarketState } from "@/lib/format";

type StatusTone = {
  dot: string;
  chip: string;
  pulse: boolean;
};

function toneForState(state: string): StatusTone {
  switch (state) {
    case "REGULAR":
      return {
        dot: "bg-emerald-400",
        chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
        pulse: true,
      };
    case "PRE":
    case "PREPRE":
    case "POST":
    case "POSTPOST":
      return {
        dot: "bg-amber-400",
        chip: "border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
        pulse: false,
      };
    case "CLOSED":
      return {
        dot: "bg-slate-500",
        chip: "border-slate-600 bg-slate-800/60 text-slate-300 hover:bg-slate-800",
        pulse: false,
      };
    default:
      return {
        dot: "bg-slate-500",
        chip: "border-slate-600 bg-slate-800/60 text-slate-400 hover:bg-slate-800",
        pulse: false,
      };
  }
}

export default function Header() {
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketState, setMarketState] = useState<string>("UNKNOWN");

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/market-status", {
          cache: "no-store",
        });
        const data = await response.json();
        if (!cancelled) setMarketState(data.marketState ?? "UNKNOWN");
      } catch {
        // Leave the badge in its unknown state.
      }
    }

    loadStatus();
    const interval = setInterval(loadStatus, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const tone = toneForState(marketState);
  const label =
    marketState === "UNKNOWN" ? "Live Market Data" : formatMarketState(marketState);

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="hidden rounded-xl bg-blue-600/15 p-2.5 text-blue-400 sm:block">
              <ChartCandlestick className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Portfolio Risk Analyzer
              </h1>
              <p className="text-sm text-slate-400">
                Stock risk, technical levels, and portfolio analysis powered by Yahoo Finance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMarketOpen(true)}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition ${tone.chip}`}
          >
            <span className="relative flex h-2 w-2">
              {tone.pulse && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${tone.dot}`}
                />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${tone.dot}`}
              />
            </span>
            {label}
          </button>
        </div>
      </header>

      <LiveMarketModal open={marketOpen} onClose={() => setMarketOpen(false)} />
    </>
  );
}
