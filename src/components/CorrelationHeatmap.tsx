"use client";

import { Grid3x3 } from "lucide-react";

interface CorrelationHeatmapProps {
  symbols: string[];
  matrix: number[][];
  avgCorrelation: number;
  avgPairRSquared?: number;
}

/** Cyan for opposite moves through bare surface at zero to orange when they move as one. */
function cellColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));

  if (clamped >= 0) {
    return `rgba(255, 80, 0, ${(clamped * 0.75).toFixed(3)})`;
  }
  return `rgba(0, 200, 240, ${(Math.abs(clamped) * 0.75).toFixed(3)})`;
}

function describeAverage(avg: number): string {
  if (avg >= 0.8) {
    return "This portfolio moves almost as one stock. Spreading money across these names does not spread the risk.";
  }
  if (avg >= 0.6) {
    return "These names usually rally and sell off together. A bad day for the sector would hit most of them at once.";
  }
  if (avg >= 0.35) {
    return "They often move in the same direction, but not in lockstep. There is some diversification, not a lot.";
  }
  if (avg >= 0) {
    return "These holdings do not typically move together. A drop in one is not a reliable signal that the others will drop.";
  }
  return "On average these names move against each other, so they partly offset — unusual, and useful if it holds.";
}

function describePair(a: string, b: string, r: number): string {
  const pct = Math.round(r * r * 100);
  if (r >= 0.7) {
    return `When ${a} has a strong day, ${b} usually does too (r = ${r.toFixed(2)}). About ${pct}% of their daily moves are shared, so they are not independent bets.`;
  }
  if (r >= 0.4) {
    return `${a} and ${b} often move in the same direction (r = ${r.toFixed(2)}), sharing about ${pct}% of daily moves. Related, but not identical.`;
  }
  if (r > -0.2) {
    return `${a} and ${b} do not move in lockstep (r = ${r.toFixed(2)}). A bad day for one often does not mean a bad day for the other.`;
  }
  return `${a} and ${b} tend to move in opposite directions (r = ${r.toFixed(2)}), so they partly offset each other.`;
}

function strongestOffDiagonal(
  symbols: string[],
  matrix: number[][]
): { a: string; b: string; r: number } | null {
  let best: { a: string; b: string; r: number } | null = null;

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const r = matrix[i][j];
      if (!Number.isFinite(r)) continue;
      if (best == null || Math.abs(r) > Math.abs(best.r)) {
        best = { a: symbols[i], b: symbols[j], r };
      }
    }
  }

  return best;
}

export default function CorrelationHeatmap({
  symbols,
  matrix,
  avgCorrelation,
  avgPairRSquared,
}: CorrelationHeatmapProps) {
  const usable =
    symbols.length >= 2 &&
    matrix.length === symbols.length &&
    matrix.every((row) => row.length === symbols.length);

  const example = usable ? strongestOffDiagonal(symbols, matrix) : null;

  return (
    <section className="surface-2 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
        <Grid3x3 className="h-5 w-5 text-slate-500" aria-hidden="true" />
        Do these stocks move together?
      </h3>
      <p className="mt-1 text-sm text-slate-400">
        Each cell is one pair. Pick a ticker on the left and one along the top —
        the number says whether they tend to rise and fall on the same days.
      </p>

      {!usable ? (
        <p className="mt-6 text-sm text-slate-500">
          Add at least two holdings to compare how they move together.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="border-separate border-spacing-0.5 text-xs">
              <thead>
                <tr>
                  <th className="p-1" />
                  {symbols.map((symbol) => (
                    <th
                      key={symbol}
                      className="p-1 font-medium text-slate-400"
                      scope="col"
                    >
                      {symbol}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbols.map((rowSymbol, i) => (
                  <tr key={rowSymbol}>
                    <th
                      className="p-1 pr-2 text-right font-medium text-slate-400"
                      scope="row"
                    >
                      {rowSymbol}
                    </th>
                    {symbols.map((colSymbol, j) => {
                      const value = matrix[i][j];
                      const diagonal = i === j;
                      return (
                        <td
                          key={colSymbol}
                          title={
                            diagonal
                              ? `${rowSymbol} compared with itself is always 1.00`
                              : `${rowSymbol} vs ${colSymbol}: ${value.toFixed(2)} means they ${
                                  value >= 0.4
                                    ? "usually move together"
                                    : value <= -0.2
                                      ? "often move opposite"
                                      : "do not move in lockstep"
                                }`
                          }
                          className={`h-10 min-w-12 rounded text-center tabular-nums ${
                            diagonal ? "text-slate-500" : "text-slate-100"
                          }`}
                          style={{ backgroundColor: cellColor(value) }}
                        >
                          {value.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
            <span>Move opposite (−1)</span>
            <span
              className="h-2 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, rgba(0,200,240,0.75), rgba(43,49,55,0.6), rgba(255,80,0,0.75))",
              }}
            />
            <span className="text-right">Move together (+1)</span>
            <span />
            <span className="text-center text-slate-600">Unrelated (0)</span>
            <span />
          </div>

          <ul className="mt-4 space-y-2 text-sm text-slate-400">
            <li>
              <span className="font-medium text-slate-300">1.00 on the diagonal</span>{" "}
              is a stock compared with itself. That is always a perfect match.
            </li>
            <li>
              <span className="font-medium text-slate-300">The grid is a mirror.</span>{" "}
              AAPL vs MSFT is the same number as MSFT vs AAPL — it is one
              relationship, shown twice.
            </li>
            <li>
              <span className="font-medium text-slate-300">Closer to +1</span>{" "}
              (orange) means they usually rally and sell off together.{" "}
              <span className="font-medium text-slate-300">Closer to 0</span> means
              they are not in lockstep.{" "}
              <span className="font-medium text-slate-300">Negative</span> (cyan)
              means they often move opposite, which is a hedge.
            </li>
          </ul>

          {example && (
            <p className="mt-4 rounded-lg border border-slate-700/60 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
              Example from your portfolio: {describePair(example.a, example.b, example.r)}
            </p>
          )}

          <p className="mt-3 text-sm text-slate-400">
            Average across all pairs:{" "}
            <span className="font-medium tabular-nums text-slate-200">
              {avgCorrelation.toFixed(2)}
            </span>
            . {describeAverage(avgCorrelation)}
          </p>
          {avgPairRSquared != null && (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Average shared move is {avgPairRSquared.toFixed(2)} (that is r × r,
              not a second kind of correlation). A pair at 0.70 shares about 49%
              of daily moves.
            </p>
          )}
        </>
      )}
    </section>
  );
}
