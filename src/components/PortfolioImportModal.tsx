"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  ImageUp,
  Loader2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { ImportedHolding } from "@/lib/portfolio-import";
import type { PortfolioHolding } from "@/lib/types";

interface PortfolioImportModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (holdings: PortfolioHolding[], mode: "replace" | "append") => void;
}

type Stage = "upload" | "reading" | "review";

const inputClass =
  "rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";

export default function PortfolioImportModal({
  open,
  onClose,
  onApply,
}: PortfolioImportModalProps) {
  const [stage, setStage] = useState<Stage>("upload");
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportedHolding[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setStage("upload");
    setError(null);
    setWarnings([]);
    setRows([]);
    setDragging(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function upload(file: File) {
    setStage("reading");
    setError(null);
    setWarnings([]);

    const body = new FormData();
    body.append("image", file);

    try {
      const response = await fetch("/api/portfolio/import-image", {
        method: "POST",
        body,
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error ?? "Could not read that image.");
        setStage("upload");
        return;
      }

      if (!payload.holdings?.length) {
        setError(
          payload.warnings?.[0] ??
            "No positions were found. Try a clearer screenshot of the holdings list."
        );
        setStage("upload");
        return;
      }

      setRows(payload.holdings);
      setWarnings(payload.warnings ?? []);
      setStage("review");
    } catch {
      setError("Upload failed. Check your connection and try again.");
      setStage("upload");
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
            <ImageUp className="h-5 w-5 text-slate-500" aria-hidden="true" />
            Import from a screenshot
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
          {stage === "upload" && (
            <>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) upload(file);
                }}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
                  dragging
                    ? "border-blue-500 bg-blue-500/5"
                    : "border-slate-700 bg-slate-900/40"
                }`}
              >
                <Upload
                  className="h-8 w-8 text-slate-500"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium text-white">
                  Drop a screenshot here
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  A holdings list from Robinhood, Fidelity, Schwab, or any
                  tracker. PNG, JPEG, or WebP up to 8 MB.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
                >
                  Choose file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload(file);
                    event.target.value = "";
                  }}
                />
              </div>

              {error && (
                <p className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  {error}
                </p>
              )}

              <p className="mt-4 text-xs text-slate-500">
                The image is sent to an AI service to be read, then discarded.
                Nothing is stored on the server. You will review and correct
                every row before anything is added.
              </p>
            </>
          )}

          {stage === "reading" && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2
                className="h-8 w-8 animate-spin text-blue-400"
                aria-hidden="true"
              />
              <p className="mt-4 text-sm font-medium text-white">
                Reading your screenshot
              </p>
              <p className="mt-1 text-xs text-slate-400">
                This usually takes five to ten seconds.
              </p>
            </div>
          )}

          {stage === "review" && (
            <>
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                Check every row before importing. Reading numbers from an image
                is not perfect, and a wrong share count or cost basis will skew
                your risk and P&amp;L.
              </p>

              {warnings.map((warning) => (
                <p
                  key={warning}
                  className="mt-2 text-xs text-slate-400"
                >
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

        {stage === "review" && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Start over
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
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500"
            >
              Replace portfolio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
