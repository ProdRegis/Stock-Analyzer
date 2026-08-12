"use client";

import { Grid3x3 } from "lucide-react";

interface CorrelationHeatmapProps {
  symbols: string[];
  matrix: number[][];
  avgCorrelation: number;
}

/** Cyan for negative correlation through bare surface at zero to red at +1. */
function cellColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value));

  if (clamped >= 0) {
    // 0 → transparent, 1 → strong red, since high correlation is the risk
    return `rgba(255, 80, 0, ${(clamped * 0.75).toFixed(3)})`;
  }
  return `rgba(0, 200, 240, ${(Math.abs(clamped) * 0.75).toFixed(3)})`;
}

function describe(avg: number): string {
  if (avg >= 0.8) {
    return "These holdings move almost as one — diversification is minimal.";
  }
  if (avg >= 0.6) {
    return "Holdings are strongly correlated; a sector shock would hit most at once.";
  }
  if (avg >= 0.35) {
    return "Moderate correlation — some diversification benefit, but not much.";
  }
  if (avg >= 0) {
    return "Low correlation — positions move fairly independently.";
  }
  return "Negative average correlation — positions partly hedge each other.";
}

export default function CorrelationHeatmap({
  symbols,
  matrix,
  avgCorrelation,
}: CorrelationHeatmapProps) {
  const usable =
    symbols.length >= 2 &&
    matrix.length === symbols.length &&
    matrix.every((row) => row.length === symbols.length);

  return (
    <section className="surface-2 rounded-2xl p-5">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
        <Grid3x3 className="h-5 w-5 text-slate-500" aria-hidden="true" />
        Correlation
      </h3>
      <p className="mt-1 text-sm text-slate-400">
        How closely each pair of holdings moves together
      </p>

      {!usable ? (
        <p className="mt-6 text-sm text-slate-500">
          Add at least two holdings to see the correlation grid.
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
                      return (
                        <td
                          key={colSymbol}
                          title={`${rowSymbol} vs ${colSymbol}: ${value.toFixed(2)}`}
                          className="h-10 min-w-12 rounded text-center tabular-nums text-slate-100"
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

          <div className="mt-4 flex items-center gap-3 text-xs text-slate-500">
            <span>−1</span>
            <span
              className="h-2 flex-1 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, rgba(0,200,240,0.75), rgba(43,49,55,0.6), rgba(255,80,0,0.75))",
              }}
            />
            <span>+1</span>
          </div>

          <p className="mt-3 text-sm text-slate-400">
            Average pair correlation{" "}
            <span className="font-medium tabular-nums text-slate-200">
              {avgCorrelation.toFixed(2)}
            </span>
            . {describe(avgCorrelation)}
          </p>
        </>
      )}
    </section>
  );
}
