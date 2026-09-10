"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Waves } from "lucide-react";
import SymbolJumps from "./SymbolJumps";
import { Skeleton } from "./Skeleton";
import { pickStarter, sortUniverseRows } from "@/lib/options-universe";
import type {
  OpenOptionsHint,
  OptionsBookScan,
  OptionsLiquidity,
  OptionsScanRow,
  VolStance,
} from "@/lib/types";

type StanceFilter = "all" | "buy_vol" | "sell_vol" | "event_vol" | "wait";

const stanceLabel: Record<VolStance, string> = {
  buy_vol: "Long vol",
  sell_vol: "Short vol",
  event_vol: "Event vol",
  wait: "Sit out",
};

const liquidityLabel: Record<OptionsLiquidity, string> = {
  tight: "Tight",
  workable: "Workable",
  wide: "Wide",
  thin: "Thin",
};

function formatPct(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatRatio(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}

function liquidityClass(liquidity: OptionsLiquidity) {
  if (liquidity === "tight") return "text-emerald-300";
  if (liquidity === "workable") return "text-slate-200";
  if (liquidity === "wide") return "text-amber-200";
  return "text-slate-500";
}

export default function VolScreen({
  active,
  onOpenThesis,
  onOpenOptions,
}: {
  active: boolean;
  onOpenThesis?: (symbol: string) => void;
  onOpenOptions?: (symbol: string, hint?: OpenOptionsHint) => void;
}) {
  const [scan, setScan] = useState<OptionsBookScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StanceFilter>("all");
  const requested = useRef(false);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    setLoading(true);
    setError(null);
    void fetch("/api/options/universe", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Universe scan failed");
        }
        setScan(data as OptionsBookScan);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Universe scan failed");
        requested.current = false;
      })
      .finally(() => {
        setLoading(false);
      });
  }, [active]);

  const ranked = useMemo(
    () => (scan ? sortUniverseRows(scan.rows) : []),
    [scan]
  );
  const starter = useMemo(() => pickStarter(ranked), [ranked]);
  const visible = ranked.filter((row) =>
    filter === "all" ? true : row.stance === filter && !row.skipped
  );

  return (
    <div className="space-y-6">
      <section className="surface-1 rounded-2xl p-6">
        <div className="flex flex-wrap items-start gap-3">
          <Waves className="mt-0.5 h-5 w-5 text-blue-300" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-white">Vol screen</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              This is not a list of stocks to buy. It is the liquid optionable
              book — index ETFs and names with real ATM open interest — ranked
              by whether implied vol looks rich or cheap versus the last 30
              days. Tight bid–ask first; a high win-rate credit is not a
              reason to be here. Click a row to open the desk.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading && !scan && (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {scan && starter && (
        <section className="surface-2 rounded-2xl border border-blue-500/25 p-5">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Best place to start
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-white">
                {starter.symbol}
              </h3>
              <p className="text-sm text-slate-400">{starter.name}</p>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                {starter.reason}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">
                {stanceLabel[starter.stance]}
              </span>
              <span
                className={`rounded-full border border-slate-700 px-2.5 py-1 text-xs ${liquidityClass(starter.liquidity)}`}
              >
                {liquidityLabel[starter.liquidity]} book
              </span>
              <SymbolJumps
                symbol={starter.symbol}
                onOpenThesis={onOpenThesis}
                onOpenOptions={onOpenOptions}
              />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">ATM IV</dt>
              <dd className="text-slate-200">{formatPct(starter.atmIv)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">30d RV</dt>
              <dd className="text-slate-200">{formatPct(starter.rv30)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">IV / RV</dt>
              <dd className="text-slate-200">{formatRatio(starter.ivRvRatio)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">ATM spread</dt>
              <dd className="text-slate-200">{formatPct(starter.atmSpreadPct)}</dd>
            </div>
          </dl>
        </section>
      )}

      {scan && !starter && !loading && (
        <p className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
          No clean everyday vol edge in the liquid book right now. That is a
          valid answer — do not force a long call or an earnings lottery.
        </p>
      )}

      {scan && (
        <section className="surface-2 rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-slate-200">
              Liquid optionable names
            </h3>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "All"],
                  ["buy_vol", "Long vol"],
                  ["sell_vol", "Short vol"],
                  ["wait", "Sit out"],
                  ["event_vol", "Earnings"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    filter === id
                      ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                      : "border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            SPY / QQQ / IWM and the mega-cap books first. Names without listed
            options or a usable ATM market drop to the bottom.
          </p>

          {visible.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              Nothing in this filter. Try All.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="px-2 py-2 text-left font-medium">Name</th>
                    <th className="px-2 py-2 text-left font-medium">Book</th>
                    <th className="px-2 py-2 text-right font-medium">ATM IV</th>
                    <th className="px-2 py-2 text-right font-medium">30d RV</th>
                    <th className="px-2 py-2 text-right font-medium">IV/RV</th>
                    <th className="px-2 py-2 text-left font-medium">Stance</th>
                    <th className="px-2 py-2 text-left font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <UniverseRow
                      key={row.symbol}
                      row={row}
                      starter={starter?.symbol === row.symbol}
                      onOpenThesis={onOpenThesis}
                      onOpenOptions={onOpenOptions}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function UniverseRow({
  row,
  starter,
  onOpenThesis,
  onOpenOptions,
}: {
  row: OptionsScanRow;
  starter: boolean;
  onOpenThesis?: (symbol: string) => void;
  onOpenOptions?: (symbol: string, hint?: OpenOptionsHint) => void;
}) {
  return (
    <tr
      className={`border-b border-slate-800/80 ${
        row.skipped
          ? "text-slate-500"
          : "cursor-pointer hover:bg-slate-900/80"
      } ${starter ? "bg-blue-500/5" : ""}`}
      onClick={() => {
        if (!row.skipped) {
          onOpenOptions?.(
            row.symbol,
            row.earningsDate ? { eventDate: row.earningsDate } : undefined
          );
        }
      }}
    >
      <td className="px-2 py-2">
        <span className="font-medium text-white">{row.symbol}</span>
        <span className="ml-2 text-slate-500">{row.name}</span>
        {starter && (
          <span className="ml-2 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-200">
            Start here
          </span>
        )}
      </td>
      <td className={`px-2 py-2 ${liquidityClass(row.liquidity)}`}>
        {row.skipped ? "—" : liquidityLabel[row.liquidity]}
        {row.atmSpreadPct != null && !row.skipped
          ? ` · ${formatPct(row.atmSpreadPct)}`
          : ""}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-200">
        {formatPct(row.atmIv)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-200">
        {formatPct(row.rv30)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-slate-200">
        {formatRatio(row.ivRvRatio)}
      </td>
      <td className="px-2 py-2 text-slate-300">
        {row.skipped ? row.skipped : stanceLabel[row.stance]}
      </td>
      <td className="px-2 py-2 text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <span className="line-clamp-2">{row.reason}</span>
          {!row.skipped && (
            <span
              onClick={(event) => event.stopPropagation()}
              className="shrink-0"
            >
              <SymbolJumps
                symbol={row.symbol}
                onOpenThesis={onOpenThesis}
                onOpenOptions={onOpenOptions}
              />
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
