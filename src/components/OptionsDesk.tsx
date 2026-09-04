"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, TriangleAlert } from "lucide-react";
import EmptyState from "./EmptyState";
import OpenThesisButton from "./OpenThesisButton";
import { Skeleton } from "./Skeleton";
import StockSearchInput, { resolveStockQuery } from "./StockSearchInput";
import { timeYearsFromDays } from "@/lib/black-scholes";
import {
  customStructureView,
  structureMatchesStance,
  toggleDraftLeg,
  type DraftLeg,
} from "@/lib/options-builder";
import { structureCurves, type StructureLeg } from "@/lib/options-structures";
import { lastOptionsSymbolStore } from "@/lib/tab-memory";
import type {
  MarketSearchResult,
  OptionContract,
  OptionRight,
  OptionsBookScan,
  OptionsScanRow,
  OptionStructureView,
  OptionsDeskSnapshot,
  VolStance,
} from "@/lib/types";

function formatPct(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatIv(value: number | null) {
  return formatPct(value, 1);
}

function formatMoney(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  return `${sign}$${abs.toFixed(digits)}`;
}

function formatDelta(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function formatDte(dte: number) {
  return `${dte} DTE`;
}

function formatExpiry(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function expiryOnOrAfter(
  expirations: Array<{ expiration: string }>,
  eventDate: string
): string | null {
  const sorted = [...expirations].sort((a, b) =>
    a.expiration.localeCompare(b.expiration)
  );
  return (
    sorted.find((row) => row.expiration >= eventDate)?.expiration ??
    sorted.at(-1)?.expiration ??
    null
  );
}

const stanceCopy: Record<VolStance, { label: string; className: string }> = {
  sell_vol: {
    label: "Short vol — defined risk",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  },
  buy_vol: {
    label: "Long vol",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  event_vol: {
    label: "Event vol — print inside this expiry",
    className: "border-violet-500/30 bg-violet-500/10 text-violet-100",
  },
  wait: {
    label: "No-trade zone",
    className: "border-slate-600/60 bg-slate-800/60 text-slate-200",
  },
};

function OptionsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading options desk">
      <div className="surface-2 rounded-2xl p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <p className="text-center text-sm text-slate-500">
        Pulling the chain, inverting IV, and measuring realized vol…
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function SideCells({
  contract,
  atm,
  align,
  selected,
  onToggle,
}: {
  contract: OptionContract | null;
  atm?: boolean;
  align: "left" | "right";
  selected?: "long" | "short" | null;
  onToggle?: () => void;
}) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  if (!contract) {
    return (
      <>
        <td className={`px-2 py-1.5 text-slate-600 ${alignClass}`}>—</td>
        <td className={`px-2 py-1.5 text-slate-600 ${alignClass}`}>—</td>
        <td className={`px-2 py-1.5 text-slate-600 ${alignClass}`}>—</td>
        <td className={`px-2 py-1.5 text-slate-600 ${alignClass}`}>—</td>
        <td
          className={`hidden px-2 py-1.5 text-slate-600 lg:table-cell ${alignClass}`}
        >
          —
        </td>
      </>
    );
  }
  const selectedTone =
    selected === "long"
      ? "bg-blue-500/20"
      : selected === "short"
        ? "bg-amber-500/20"
        : "";
  const itm = contract.inTheMoney;
  const tone = `px-2 py-1.5 tabular-nums cursor-pointer ${alignClass} ${
    itm ? "bg-blue-500/5 text-slate-200" : "text-slate-300"
  } ${atm ? "font-medium" : ""} ${contract.illiquid ? "opacity-60" : ""} ${selectedTone}`;
  const muted = `px-2 py-1.5 tabular-nums cursor-pointer ${alignClass} ${
    itm ? "bg-blue-500/5 text-slate-400" : "text-slate-500"
  } ${selectedTone}`;
  return (
    <>
      <td className={tone} onClick={onToggle}>
        {formatMoney(contract.bid)}
      </td>
      <td className={tone} onClick={onToggle}>
        {formatMoney(contract.ask)}
      </td>
      <td className={tone} onClick={onToggle}>
        {formatIv(contract.iv)}
      </td>
      <td className={tone} onClick={onToggle}>
        {formatDelta(contract.delta)}
      </td>
      <td className={`hidden lg:table-cell ${muted}`} onClick={onToggle}>
        {contract.openInterest?.toLocaleString() ?? "—"}
      </td>
    </>
  );
}

function PayoffChart({
  structure,
  desk,
}: {
  structure: OptionStructureView;
  desk: OptionsDeskSnapshot;
}) {
  const data = useMemo(() => {
    const legs: StructureLeg[] = structure.legs.map((leg) => ({
      type: leg.type,
      side: leg.side,
      strike: leg.strike,
      premium: leg.premium,
      quantity: 1,
      iv: leg.iv,
    }));
    return structureCurves(legs, {
      timeYears: timeYearsFromDays(Math.max(desk.selectedDte, 1)),
      rate: desk.rate,
      dividendYield: desk.dividendYield,
    }).map((point) => ({
      price: Number(point.price.toFixed(2)),
      expiration: Number(point.expiration.toFixed(2)),
      live: point.live != null ? Number(point.live.toFixed(2)) : null,
      shock: point.shock != null ? Number(point.shock.toFixed(2)) : null,
    }));
  }, [structure, desk.selectedDte, desk.rate, desk.dividendYield]);

  const hasLive = data.some((row) => row.live != null);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2b3137" />
          <XAxis
            dataKey="price"
            tick={{ fill: "#949ca4", fontSize: 11 }}
            tickFormatter={(value: number) => `$${value}`}
          />
          <YAxis
            tick={{ fill: "#949ca4", fontSize: 11 }}
            tickFormatter={(value: number) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              background: "#0e1215",
              border: "1px solid #2b3137",
              borderRadius: 8,
            }}
            formatter={(value, name) => [
              formatMoney(Number(value)),
              name === "expiration"
                ? "Expiration"
                : name === "live"
                  ? "Now (current IV)"
                  : "Now, IV +5 pts",
            ]}
            labelFormatter={(label) => `Spot ${formatMoney(Number(label))}`}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#949ca4" }}
            formatter={(value) =>
              value === "expiration"
                ? "Expiration"
                : value === "live"
                  ? "Now"
                  : "Now, IV +5"
            }
          />
          <ReferenceLine y={0} stroke="#575f66" />
          <Line
            type="linear"
            dataKey="expiration"
            stroke="#00c805"
            dot={false}
            strokeWidth={2}
          />
          {hasLive && (
            <Line
              type="linear"
              dataKey="live"
              stroke="#4ea8de"
              dot={false}
              strokeWidth={2}
            />
          )}
          {hasLive && (
            <Line
              type="linear"
              dataKey="shock"
              stroke="#c084fc"
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function stanceLabel(stance: VolStance) {
  return stanceCopy[stance].label;
}

function BookScanPanel({
  scan,
  loading,
  error,
  onOpen,
}: {
  scan: OptionsBookScan | null;
  loading: boolean;
  error: string | null;
  onOpen: (row: OptionsScanRow) => void;
}) {
  if (!loading && !scan && !error) return null;

  return (
    <section className="surface-2 rounded-2xl p-5">
      <h3 className="text-sm font-medium text-slate-200">Portfolio book scan</h3>
      <p className="mt-1 text-xs text-slate-500">
        IV versus 30-day RV and term shape across your holdings. The one-name
        desk below is for sizing; this is how you find a trade. Names without
        listed options are skipped, not failed.
      </p>
      {error && (
        <p className="mt-3 text-sm text-red-300">{error}</p>
      )}
      {loading && !scan && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}
      {scan && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="px-2 py-2 text-left font-medium">Name</th>
                <th className="px-2 py-2 text-right font-medium">ATM IV</th>
                <th className="px-2 py-2 text-right font-medium">30d RV</th>
                <th className="px-2 py-2 text-right font-medium">IV/RV</th>
                <th className="px-2 py-2 text-left font-medium">Term</th>
                <th className="px-2 py-2 text-left font-medium">Stance</th>
              </tr>
            </thead>
            <tbody>
              {scan.rows.map((row) => (
                <tr
                  key={row.symbol}
                  className={`border-b border-slate-800/80 ${
                    row.skipped
                      ? "text-slate-500"
                      : "cursor-pointer hover:bg-slate-900/80"
                  }`}
                  onClick={() => {
                    if (!row.skipped) onOpen(row);
                  }}
                >
                  <td className="px-2 py-2">
                    <span className="font-medium text-white">{row.symbol}</span>
                    <span className="ml-2 text-slate-500">{row.name}</span>
                    {row.earningsInWindow && (
                      <span className="ml-2 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-200">
                        Print in window
                      </span>
                    )}
                    {row.skipped && (
                      <span className="ml-2 text-[11px] text-slate-500">
                        {row.skipped}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatIv(row.atmIv)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatIv(row.rv30)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-slate-200">
                    {row.ivRvRatio != null ? `${row.ivRvRatio.toFixed(2)}×` : "—"}
                  </td>
                  <td className="px-2 py-2 capitalize text-slate-400">
                    {row.termShape === "unknown" ? "—" : row.termShape}
                  </td>
                  <td className="px-2 py-2 text-slate-300">
                    {row.skipped ? "—" : stanceLabel(row.stance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DeskReport({
  desk,
  onExpiryChange,
  onOpenThesis,
  requestedEventDate,
}: {
  desk: OptionsDeskSnapshot;
  onExpiryChange: (expiry: string) => void;
  onOpenThesis?: (symbol: string) => void;
  requestedEventDate?: string;
}) {
  const stance = stanceCopy[desk.stance];
  const [showWeeklies, setShowWeeklies] = useState(
    desk.selectedDte < 7
  );
  const [buildSide, setBuildSide] = useState<"long" | "short">(
    desk.stance === "sell_vol" ? "short" : "long"
  );
  const [draft, setDraft] = useState<DraftLeg[]>([]);
  const appliedEvent = useRef<string | null>(null);

  const lookup = useCallback(
    (type: OptionRight, strike: number) => {
      const row = desk.chain.find((item) => item.strike === strike);
      if (!row) return null;
      return type === "call" ? row.call : row.put;
    },
    [desk.chain]
  );

  const custom = useMemo(
    () => customStructureView(draft, lookup, desk.stance),
    [draft, lookup, desk.stance]
  );

  const recommended =
    desk.structures.find((row) => row.recommended) ?? desk.structures[0] ?? null;
  const [selectedId, setSelectedId] = useState(
    custom?.id ?? recommended?.id ?? null
  );

  useEffect(() => {
    if (!requestedEventDate) return;
    const key = `${desk.symbol}:${requestedEventDate}`;
    if (appliedEvent.current === key) return;
    const wanted = expiryOnOrAfter(desk.expirations, requestedEventDate);
    if (!wanted || wanted === desk.selectedExpiration) {
      appliedEvent.current = key;
      return;
    }
    appliedEvent.current = key;
    const meta = desk.expirations.find((row) => row.expiration === wanted);
    if (meta && meta.dte < 7) setShowWeeklies(true);
    onExpiryChange(wanted);
  }, [
    desk.symbol,
    desk.expirations,
    desk.selectedExpiration,
    requestedEventDate,
    onExpiryChange,
  ]);

  const structures = custom ? [custom, ...desk.structures] : desk.structures;
  const selected =
    structures.find((row) => row.id === selectedId) ??
    custom ??
    recommended;

  const termData = useMemo(
    () =>
      desk.expirations
        .filter((row) => row.atmIv != null)
        .map((row) => ({
          dte: row.dte,
          iv: Number(((row.atmIv ?? 0) * 100).toFixed(2)),
          label: `${row.dte}d`,
        })),
    [desk.expirations]
  );

  const visibleExpiries = desk.expirations.filter(
    (row) =>
      showWeeklies ||
      row.dte >= 7 ||
      row.expiration === desk.selectedExpiration
  );
  const loadedExpiries = desk.expirations.filter((row) => row.atmIv != null);

  function selectedSide(type: OptionRight, strike: number) {
    return (
      draft.find((leg) => leg.type === type && leg.strike === strike)?.side ??
      null
    );
  }

  function handleToggle(type: OptionRight, strike: number) {
    const next = toggleDraftLeg(draft, { type, strike, side: buildSide });
    setDraft(next);
    if (next.length > 0) setSelectedId("custom");
  }

  return (
    <div className="space-y-6">
      <section className="surface-1 rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold text-white">
                {desk.symbol}
              </h2>
              <span
                className={`rounded-full border px-3 py-1 text-sm font-medium ${stance.className}`}
              >
                {stance.label}
              </span>
              {onOpenThesis && (
                <OpenThesisButton symbol={desk.symbol} onOpen={onOpenThesis} />
              )}
            </div>
            <p className="mt-1 text-sm text-slate-400">{desk.name}</p>
            <p className="mt-1 text-xs text-slate-500">
              {formatMoney(desk.spot)} ·{" "}
              {desk.changePercent >= 0 ? "+" : ""}
              {desk.changePercent.toFixed(2)}% · {formatExpiry(desk.selectedExpiration)}{" "}
              ({formatDte(desk.selectedDte)})
              {desk.earningsDate && (
                <>
                  {" "}
                  · Earnings {formatExpiry(desk.earningsDate)}
                  {desk.earningsInWindow ? " — inside this expiry" : ""}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <Metric
            label="ATM IV"
            value={formatIv(desk.atmIv)}
            hint={desk.atmStrike != null ? `${desk.atmStrike} strike` : undefined}
          />
          <Metric
            label="30d RV"
            value={formatIv(desk.rv.d30)}
            hint={desk.rv.estimator ?? undefined}
          />
          <Metric
            label="IV / RV"
            value={
              desk.ivRvRatio != null ? `${desk.ivRvRatio.toFixed(2)}×` : "—"
            }
            hint="Everyday VRP band: 0.85–1.15"
          />
          <Metric
            label="VRP (IV − RV)"
            value={formatPct(desk.vrp, 1)}
            hint="Positive = IV rich vs realized"
          />
          <Metric
            label="Rule of 16"
            value={
              desk.expectedDailyMove != null
                ? `±${(desk.expectedDailyMove * 100).toFixed(2)}%`
                : "—"
            }
            hint="Implied 1σ daily move"
          />
          <Metric
            label={desk.earningsInWindow ? "Implied print move" : "Move to expiry"}
            value={formatMoney(
              desk.earningsInWindow
                ? desk.eventImpliedMove
                : desk.expectedMoveToExpiry,
              2
            )}
            hint={
              desk.earningsInWindow
                ? "Spot × IV × √(days to print)"
                : "Spot × IV × √T"
            }
          />
          <Metric
            label="Term structure"
            value={
              desk.termShape === "contango"
                ? "Contango"
                : desk.termShape === "backwardation"
                  ? "Backwardation"
                  : desk.termShape === "flat"
                    ? "Flat"
                    : "—"
            }
            hint={
              desk.termSlopePerMonth != null
                ? `${desk.termSlopePerMonth >= 0 ? "+" : ""}${(desk.termSlopePerMonth * 100).toFixed(1)} vol pts / month`
                : undefined
            }
          />
          <Metric
            label="25Δ risk reversal"
            value={formatPct(desk.skew.riskReversal, 1)}
            hint="OTM put IV − OTM call IV"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">
            ATM term structure
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Upward slope is contango — the usual state. An inverted front is
            fear or a known event, not a vanilla VRP sale.
          </p>
          <div className="mt-3 h-52 w-full">
            {termData.length >= 2 ? (
              <ResponsiveContainer>
                <LineChart
                  data={termData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2b3137" />
                  <XAxis
                    dataKey="dte"
                    tick={{ fill: "#949ca4", fontSize: 11 }}
                    tickFormatter={(value: number) => `${value}d`}
                  />
                  <YAxis
                    tick={{ fill: "#949ca4", fontSize: 11 }}
                    tickFormatter={(value: number) => `${value}%`}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0e1215",
                      border: "1px solid #2b3137",
                      borderRadius: 8,
                    }}
                    formatter={(value) => [`${value}%`, "ATM IV"]}
                    labelFormatter={(label) => `${label} DTE`}
                  />
                  <Line
                    type="monotone"
                    dataKey="iv"
                    stroke="#00c805"
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="pt-12 text-center text-sm text-slate-500">
                Not enough expirations with ATM IV to plot a curve.
              </p>
            )}
          </div>
          {desk.forwardVol != null && (
            <p className="mt-2 text-xs text-slate-500">
              Forward vol between the nearest and furthest loaded slices:{" "}
              {formatIv(desk.forwardVol)}.
            </p>
          )}
        </section>

        <section className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">Vol thesis</h3>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-300">
            {desk.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {desk.warnings.length > 0 && (
            <ul className="mt-4 space-y-2">
              {desk.warnings.map((warning) => (
                <li
                  key={warning}
                  className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-100"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  {warning}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Theta is the rent for gamma, not an edge. A short-premium P&amp;L
            that “collects theta” is a bet that subsequent realized vol comes
            in below the IV you sold (the variance risk premium). Limit orders
            only — the bid–ask is a built-in cost.
          </p>
        </section>
      </div>

      <section className="surface-2 rounded-2xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-slate-200">Option chain</h3>
            <p className="mt-1 text-xs text-slate-500">
              Click a call or put to add it as a leg. Click again to remove.
              Buy uses the ask; sell uses the bid. Front-week expiries stay
              hidden until you turn weeklies on.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-slate-700 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setBuildSide("long")}
                className={`rounded-md px-2.5 py-1 ${
                  buildSide === "long"
                    ? "bg-blue-500/20 text-blue-200"
                    : "text-slate-400"
                }`}
              >
                Buy
              </button>
              <button
                type="button"
                onClick={() => setBuildSide("short")}
                className={`rounded-md px-2.5 py-1 ${
                  buildSide === "short"
                    ? "bg-amber-500/20 text-amber-200"
                    : "text-slate-400"
                }`}
              >
                Sell
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={showWeeklies}
                onChange={(event) => setShowWeeklies(event.target.checked)}
              />
              Weeklies / 0 DTE
            </label>
            <label className="text-xs text-slate-400">
              Expiration
              <select
                className="ml-2 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                value={desk.selectedExpiration}
                onChange={(event) => onExpiryChange(event.target.value)}
              >
                {visibleExpiries.map((row) => (
                  <option key={row.expiration} value={row.expiration}>
                    {formatExpiry(row.expiration)} · {formatDte(row.dte)}
                    {row.atmIv != null ? ` · IV ${formatIv(row.atmIv)}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {loadedExpiries.length < desk.expirations.length && (
          <p className="mt-2 text-[11px] text-slate-500">
            ATM IV is preloaded on {loadedExpiries.length} slices for the term
            structure. Pick another expiry to load its full chain.
          </p>
        )}

        {custom && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
            <span className="font-medium text-white">Custom</span>
            <span className="uppercase tracking-wide text-slate-500">
              {custom.debitCredit} {formatMoney(custom.netPremium)}
            </span>
            <span>
              Max loss{" "}
              {custom.maxLoss == null ? "unlimited" : formatMoney(custom.maxLoss, 0)}
            </span>
            {(() => {
              const match = structureMatchesStance(
                desk.stance,
                custom.netVega,
                custom.definedRisk
              );
              if (match === "match") {
                return <span className="text-emerald-300">Matches vol stance</span>;
              }
              if (match === "conflict") {
                return <span className="text-amber-200">Fights vol stance</span>;
              }
              return <span className="text-slate-500">No vol view to match</span>;
            })()}
            <button
              type="button"
              className="ml-auto text-slate-400 hover:text-white"
              onClick={() => {
                setDraft([]);
                setSelectedId(recommended?.id ?? null);
              }}
            >
              Clear legs
            </button>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="px-2 py-2 text-right font-medium" colSpan={5}>
                  Calls
                </th>
                <th className="px-2 py-2 font-medium">Strike</th>
                <th className="px-2 py-2 text-left font-medium" colSpan={5}>
                  Puts
                </th>
              </tr>
              <tr className="border-b border-slate-800 text-slate-500">
                <th className="px-2 py-1 text-right font-normal">Bid</th>
                <th className="px-2 py-1 text-right font-normal">Ask</th>
                <th className="px-2 py-1 text-right font-normal">IV</th>
                <th className="px-2 py-1 text-right font-normal">Δ</th>
                <th className="hidden px-2 py-1 text-right font-normal lg:table-cell">
                  OI
                </th>
                <th />
                <th className="px-2 py-1 text-left font-normal">Bid</th>
                <th className="px-2 py-1 text-left font-normal">Ask</th>
                <th className="px-2 py-1 text-left font-normal">IV</th>
                <th className="px-2 py-1 text-left font-normal">Δ</th>
                <th className="hidden px-2 py-1 text-left font-normal lg:table-cell">
                  OI
                </th>
              </tr>
            </thead>
            <tbody>
              {desk.chain.map((row) => {
                const atm = row.strike === desk.atmStrike;
                return (
                  <tr
                    key={row.strike}
                    className={`border-b border-slate-800/80 ${
                      atm ? "bg-violet-500/5" : ""
                    }`}
                  >
                    <SideCells
                      contract={row.call}
                      atm={atm}
                      align="right"
                      selected={selectedSide("call", row.strike)}
                      onToggle={
                        row.call
                          ? () => handleToggle("call", row.strike)
                          : undefined
                      }
                    />
                    <td
                      className={`px-2 py-1.5 text-center tabular-nums font-medium ${
                        atm ? "text-violet-200" : "text-white"
                      }`}
                    >
                      {row.strike}
                    </td>
                    <SideCells
                      contract={row.put}
                      atm={atm}
                      align="left"
                      selected={selectedSide("put", row.strike)}
                      onToggle={
                        row.put
                          ? () => handleToggle("put", row.strike)
                          : undefined
                      }
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {structures.length > 0 && (
        <section className="surface-2 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-slate-200">
            Structure toolkit
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            A structure is a payoff shape, not a strategy. The highlighted card
            is the one that matches the vol stance. Premiums use bid to sell
            and ask to buy, so the debit/credit is conservative versus mid.
            One contract, multiplier 100. Not a broker — no live margin.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {structures.map((structure) => {
              const active = structure.id === selected?.id;
              return (
                <button
                  key={structure.id}
                  type="button"
                  onClick={() => setSelectedId(structure.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                      : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white"
                  }`}
                >
                  {structure.name}
                  {structure.recommended ? " · match" : ""}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-medium text-white">
                    {selected.name}
                  </h4>
                  <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                    {selected.debitCredit} {formatMoney(selected.netPremium)}
                  </span>
                  {selected.definedRisk ? (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                      Defined risk
                    </span>
                  ) : (
                    <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                      Undefined risk
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {selected.thesis}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Max profit</dt>
                    <dd className="text-slate-200">
                      {selected.maxProfit == null
                        ? "Unlimited"
                        : formatMoney(selected.maxProfit, 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Max loss</dt>
                    <dd className="text-slate-200">
                      {selected.maxLoss == null
                        ? "Unlimited"
                        : formatMoney(selected.maxLoss, 0)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Breakevens</dt>
                    <dd className="text-slate-200">
                      {selected.breakevens.length === 0
                        ? "—"
                        : selected.breakevens
                            .map((value) => formatMoney(value, 2))
                            .join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Capital at risk</dt>
                    <dd className="text-slate-200">
                      {selected.capitalAtRisk == null
                        ? "Broker / uncovered"
                        : formatMoney(selected.capitalAtRisk, 0)}
                    </dd>
                  </div>
                </dl>
                <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Δ</dt>
                    <dd className="tabular-nums text-slate-200">
                      {formatDelta(selected.netDelta)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Γ</dt>
                    <dd className="tabular-nums text-slate-200">
                      {formatDelta(selected.netGamma)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Θ / day</dt>
                    <dd className="tabular-nums text-slate-200">
                      {formatMoney(selected.netTheta, 3)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Vega / vol pt</dt>
                    <dd className="tabular-nums text-slate-200">
                      {formatMoney(selected.netVega, 3)}
                    </dd>
                  </div>
                </dl>
                <ul className="mt-4 space-y-1 text-xs text-slate-400">
                  {selected.legs.map((leg, index) => (
                    <li key={`${leg.type}-${leg.strike}-${index}`}>
                      {leg.side === "long" ? "Buy" : "Sell"} {leg.strike}{" "}
                      {leg.type} @ {formatMoney(leg.premium)}
                      {leg.delta != null ? ` · Δ ${formatDelta(leg.delta)}` : ""}
                      {leg.iv != null ? ` · IV ${formatIv(leg.iv)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs text-slate-500">
                  Green is expiration P&amp;L. Blue is mark-to-model at current
                  IV and remaining time — that is the gamma/theta path you live
                  through. Dashed is the same curve after a +5 vol-point shock.
                </p>
                <PayoffChart structure={selected} desk={desk} />
              </div>
            </div>
          )}
        </section>
      )}

      <section className="surface-2 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-slate-200">
          Risks this desk will not hide
        </h3>
        <ul className="mt-3 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
          <li>
            <span className="font-medium text-slate-200">Pin risk.</span> Close
            shorts near the strike into expiration Friday. Weekend assignment
            is not a rounding error.
          </li>
          <li>
            <span className="font-medium text-slate-200">Early exercise.</span>{" "}
            Deep ITM American puts (interest on strike cash) and deep ITM calls
            ahead of a dividend.
          </li>
          <li>
            <span className="font-medium text-slate-200">Gap risk.</span> Delta
            hedging assumes continuous prints. Overnight jumps are why uncovered
            short gamma is a career risk, not a yield product.
          </li>
          <li>
            <span className="font-medium text-slate-200">Liquidity.</span> Last
            price can be hours stale. Volume is today; open interest is the
            book. Wide spreads are a tax — do not market-order them.
          </li>
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          {desk.modelNote} Risk-free rate: {desk.rateSource}. 20-day RV
          percentile is ATM IV ranked in this name&apos;s own realized-vol
          history — not a true historical IV percentile. Informational only, not
          a broker and not financial advice.
        </p>
      </section>
    </div>
  );
}

export default function OptionsDesk({
  active = true,
  portfolioSymbols = [],
  requestedSymbol,
  requestedAt,
  requestedEventDate,
  onOpenThesis,
}: {
  active?: boolean;
  portfolioSymbols?: string[];
  requestedSymbol?: string | null;
  requestedAt?: number;
  requestedEventDate?: string;
  onOpenThesis?: (symbol: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<MarketSearchResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desk, setDesk] = useState<OptionsDeskSnapshot | null>(null);
  const [scan, setScan] = useState<OptionsBookScan | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const restored = useRef(false);
  const scanKey = useRef<string | null>(null);

  const loadDesk = useCallback(async (symbol: string, expiry?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = expiry ? `?expiry=${encodeURIComponent(expiry)}` : "";
      const response = await fetch(
        `/api/options/${encodeURIComponent(symbol)}${params}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Options lookup failed");
      }
      const next = data as OptionsDeskSnapshot;
      setDesk(next);
      setSearchQuery(`${next.symbol} — ${next.name}`);
      lastOptionsSymbolStore.set({ symbol: next.symbol, name: next.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDesk((current) => (current?.symbol === symbol.toUpperCase() ? current : null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const symbol = requestedSymbol?.trim().toUpperCase();
    if (!active || !symbol || requestedAt == null) return;
    restored.current = true;
    void loadDesk(symbol);
  }, [active, requestedSymbol, requestedAt, loadDesk]);

  useEffect(() => {
    if (!active || restored.current) return;
    restored.current = true;
    const remembered = lastOptionsSymbolStore.getSnapshot();
    if (!remembered?.symbol) return;
    const timer = window.setTimeout(() => {
      void loadDesk(remembered.symbol);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, loadDesk]);

  useEffect(() => {
    if (!active || portfolioSymbols.length === 0) return;
    const key = portfolioSymbols.join(",");
    if (scanKey.current === key) return;
    scanKey.current = key;
    setScanLoading(true);
    setScanError(null);
    void fetch("/api/options/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: portfolioSymbols }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Book scan failed");
        }
        setScan(data as OptionsBookScan);
      })
      .catch((err) => {
        setScanError(err instanceof Error ? err.message : "Book scan failed");
      })
      .finally(() => setScanLoading(false));
  }, [active, portfolioSymbols]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      const resolved = await resolveStockQuery(searchQuery, selectedStock);
      if (!resolved) {
        setError("Pick a name from the list, or type a ticker.");
        return;
      }
      setSelectedStock(resolved);
      setSearchQuery(`${resolved.symbol} — ${resolved.name}`);
      await loadDesk(resolved.symbol);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  return (
    <div className="space-y-6">
      <section className="surface-1 rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Options desk</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Options are volatility products. This tab prices the chain in IV,
              measures realized vol, and only then picks a structure. It will
              not tell you to buy a call because you are bullish.
            </p>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap gap-3" onSubmit={handleSubmit}>
          <div className="min-w-[16rem] flex-1">
            <StockSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              selected={selectedStock}
              onSelect={(result) => {
                setSelectedStock(result);
                setSearchQuery(`${result.symbol} — ${result.name}`);
              }}
              onClearSelection={() => setSelectedStock(null)}
              placeholder="Ticker or company name"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-black transition hover:bg-blue-500 disabled:opacity-50"
          >
            {loading ? "Reading the chain…" : "Open desk"}
          </button>
        </form>
      </section>

      <BookScanPanel
        scan={scan}
        loading={scanLoading}
        error={scanError}
        onOpen={(row) => void loadDesk(row.symbol, row.expiration ?? undefined)}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading && !desk && <OptionsSkeleton />}
      {loading && desk && (
        <p className="text-center text-sm text-slate-500">Updating chain…</p>
      )}

      {!loading && !desk && !error && (
        <EmptyState
          icon={Activity}
          title="No chain loaded"
          description="Search a name with listed options, or click a holding in the book scan. You will get ATM IV versus realized vol, the term structure, skew, a stance, and defined-risk structures sized to that view."
        />
      )}

      {desk && (
        <DeskReport
          key={`${desk.symbol}-${desk.selectedExpiration}`}
          desk={desk}
          onExpiryChange={(expiry) => void loadDesk(desk.symbol, expiry)}
          onOpenThesis={onOpenThesis}
          requestedEventDate={requestedEventDate}
        />
      )}
    </div>
  );
}
