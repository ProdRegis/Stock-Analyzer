"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Trash2,
  X,
} from "lucide-react";
import type { ImportedHolding } from "@/lib/portfolio-import";
import {
  HOLDINGS_JSON_EXAMPLE,
  parsePastedHoldings,
} from "@/lib/portfolio-paste";
import type { PortfolioHolding } from "@/lib/types";

interface PortfolioImportModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (holdings: PortfolioHolding[], mode: "replace" | "append") => void;
}

const inputClass =
  "rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";

export default function PortfolioImportModal({
  open,
  onClose,
  onApply,
}: PortfolioImportModalProps) {
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedHolding[]>([]);
  const [pasted, setPasted] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);

  if (!open) return null;

  function reset() {
    setReviewing(false);
    setError(null);
    setWarnings([]);
    setRows([]);
    setPasted("");
  }

  function close() {
    reset();
    onClose();
  }

  function readPasted() {
    const result = parsePastedHoldings(pasted);

    if (result.holdings.length === 0) {
      setError(result.warnings[0] ?? "Nothing recognisable in that text.");
      return;
    }

    setError(null);
    setRows(result.holdings);
    setWarnings(result.warnings);
    setReviewing(true);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(HOLDINGS_JSON_EXAMPLE);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 2_000);
    } catch {
      // Clipboard permission denied; nothing else to do but let them retry.
    }
  }

  function updateRow(index: number, patch: Partial<ImportedHolding>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function apply(mode: "replace" | "append") {
    const cleaned: PortfolioHolding[] = rows
      .map((row) => ({
        symbol: row.symbol.trim().toUpperCase(),
        shares: row.shares,
        avgCost: row.avgCost,
      }))
      .filter((row) => row.symbol.length > 0 && row.shares > 0);

    if (cleaned.length === 0) return;

    onApply(cleaned, mode);
    close();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-title"
    >
      <div className="surface-1 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2
            id="import-title"
            className="flex items-center gap-2 text-lg font-semibold text-white"
          >
            <ClipboardPaste
              className="h-5 w-5 text-slate-500"
              aria-hidden="true"
            />
            Import your holdings
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(85vh-8rem)] overflow-y-auto p-5">
          {!reviewing && (
            <>
              <label
                htmlFor="pasted-holdings"
                className="block text-sm font-medium text-slate-300"
              >
                Paste your holdings
              </label>

              <textarea
                id="pasted-holdings"
                value={pasted}
                onChange={(event) => setPasted(event.target.value)}
                rows={8}
                placeholder={"AAPL, 12, 178.40\nMSFT, 6, 405.20\nNVDA, 15"}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
              />

              <p className="mt-2 text-xs text-slate-500">
                One position per line as ticker, shares, average cost. Average
                cost is optional. A table copied straight off your brokerage
                page works too, as does a spreadsheet copy or JSON.
              </p>

              {error && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  {error}
                </p>
              )}

              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                <p className="text-sm font-medium text-white">
                  Only have a screenshot?
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Type the positions as JSON in the shape below, or copy a table
                  from a spreadsheet, then paste it in the box above.
                </p>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
                >
                  {promptCopied ? (
                    <>
                      <Check
                        className="h-3.5 w-3.5 text-emerald-400"
                        aria-hidden="true"
                      />
                      Copied
                    </>
                  ) : (
                    <>
                      <ClipboardCopy
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Copy JSON example
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {reviewing && (
            <>
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                Check every row before importing. A wrong share count or cost
                basis will skew your risk and P&amp;L.
              </p>

              {warnings.map((warning) => (
                <p key={warning} className="mt-2 text-xs text-slate-400">
                  {warning}
                </p>
              ))}

              <div className="mt-4 hidden gap-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500 sm:flex">
                <span className="flex-1">Symbol</span>
                <span className="w-24">Shares</span>
                <span className="w-28">Avg cost</span>
                <span className="w-9" />
              </div>

              <div className="mt-2 space-y-2">
                {rows.map((row, index) => (
                  <div key={index}>
                    <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                      <input
                        value={row.symbol}
                        aria-label="Symbol"
                        onChange={(event) =>
                          updateRow(index, {
                            symbol: event.target.value.toUpperCase(),
                          })
                        }
                        className={`flex-1 ${inputClass}`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label="Shares"
                        value={row.shares || ""}
                        onChange={(event) =>
                          updateRow(index, {
                            shares: Math.max(0, Number(event.target.value) || 0),
                          })
                        }
                        className={`w-24 tabular-nums ${inputClass}`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="—"
                        aria-label="Average cost per share"
                        value={row.avgCost ?? ""}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          updateRow(index, {
                            avgCost:
                              event.target.value.trim() === "" ||
                              !Number.isFinite(parsed) ||
                              parsed <= 0
                                ? undefined
                                : parsed,
                          });
                        }}
                        className={`w-28 tabular-nums ${inputClass}`}
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${row.symbol}`}
                        onClick={() =>
                          setRows((current) =>
                            current.filter((_, i) => i !== index)
                          )
                        }
                        className="rounded-lg px-3 py-2 text-slate-500 transition hover:bg-slate-800 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    {row.warning && (
                      <p className="mt-1 flex items-center gap-1.5 pl-1 text-xs text-amber-400">
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        {row.warning}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
          {reviewing ? (
            <>
              <button
                type="button"
                onClick={() => setReviewing(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => apply("append")}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
              >
                Add to existing
              </button>
              <button
                type="button"
                onClick={() => apply("replace")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-black transition hover:bg-blue-500"
              >
                Replace portfolio
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={readPasted}
              disabled={pasted.trim() === ""}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-black transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Read holdings
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
