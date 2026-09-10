"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, Plus, Trash2, Wallet } from "lucide-react";
import PortfolioSymbolInput, {
  type PortfolioSymbolInputHandle,
} from "./PortfolioSymbolInput";
import PortfolioImportModal from "./PortfolioImportModal";
import type { PortfolioHolding } from "@/lib/types";

interface PortfolioInputProps {
  holdings: PortfolioHolding[];
  onHoldingsChange: (holdings: PortfolioHolding[]) => void;
  onAnalyze: (holdings: PortfolioHolding[]) => void;
  loading: boolean;
}

const inputClass =
  "rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";

export default function PortfolioInput({
  holdings,
  onHoldingsChange,
  onAnalyze,
  loading,
}: PortfolioInputProps) {
  const symbolInputRefs = useRef<Array<PortfolioSymbolInputHandle | null>>([]);
  const [importOpen, setImportOpen] = useState(false);

  function updateShares(index: number, value: string) {
    onHoldingsChange(
      holdings.map((row, i) =>
        i === index
          ? { ...row, shares: Math.max(0, Number(value) || 0) }
          : row
      )
    );
  }

  function updateAvgCost(index: number, value: string) {
    const parsed = Number(value);
    onHoldingsChange(
      holdings.map((row, i) =>
        i === index
          ? {
              ...row,
              avgCost:
                value.trim() === "" || !Number.isFinite(parsed) || parsed <= 0
                  ? undefined
                  : parsed,
            }
          : row
      )
    );
  }

  function updateSymbol(index: number, symbol: string) {
    onHoldingsChange(
      holdings.map((row, i) => (i === index ? { ...row, symbol } : row))
    );
  }

  function addRow() {
    onHoldingsChange([...holdings, { symbol: "", shares: 0 }]);
  }

  function removeRow(index: number) {
    onHoldingsChange(holdings.filter((_, i) => i !== index));
    symbolInputRefs.current.splice(index, 1);
  }

  function applyImported(
    imported: PortfolioHolding[],
    mode: "replace" | "append"
  ) {
    if (mode === "replace") {
      onHoldingsChange(imported);
      return;
    }

    // Appending onto blank starter rows would leave empty rows behind.
    const existing = holdings.filter(
      (row) => row.symbol.trim().length > 0 && row.shares > 0
    );
    const seen = new Set(existing.map((row) => row.symbol.toUpperCase()));

    onHoldingsChange([
      ...existing,
      ...imported.filter((row) => !seen.has(row.symbol.toUpperCase())),
    ]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const committedSymbols = await Promise.all(
      holdings.map(async (_, index) => {
        const input = symbolInputRefs.current[index];
        if (input) {
          return input.commit();
        }
        return holdings[index]?.symbol.trim().toUpperCase() ?? "";
      })
    );

    const validHoldings = holdings
      .map((row, index) => ({
        symbol: committedSymbols[index] ?? row.symbol.trim().toUpperCase(),
        shares: row.shares,
        avgCost: row.avgCost,
        targetPrice: row.targetPrice,
        targetDate: row.targetDate,
      }))
      .filter((row) => row.symbol.length > 0 && row.shares > 0);

    onAnalyze(validHoldings);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="surface-2 rounded-2xl p-5 backdrop-blur"
    >
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Wallet className="h-5 w-5 text-slate-500" aria-hidden="true" />
          Your Portfolio
        </h2>
        <p className="text-sm text-slate-400">
          Add your tickers, share counts, and what you paid per share. After
          analyzing, each holding gets a suggested sell-by Friday and target
          price. Use that plan or type your own. Data is fetched live from
          Yahoo Finance.
        </p>
      </div>

      <div className="mb-2 hidden gap-2 px-1 text-xs font-medium uppercase tracking-wide text-slate-500 sm:flex">
        <span className="flex-1">Stock</span>
        <span className="w-24">Shares</span>
        <span className="w-32">Avg cost / share</span>
        <span className="w-9" />
      </div>

      <div className="space-y-2">
        {holdings.map((row, index) => (
          <div key={index} className="flex flex-wrap gap-2 sm:flex-nowrap">
            <PortfolioSymbolInput
              ref={(instance) => {
                symbolInputRefs.current[index] = instance;
              }}
              symbol={row.symbol}
              onSymbolChange={(symbol) => updateSymbol(index, symbol)}
              inputClassName={`flex-1 ${inputClass}`}
            />
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Shares"
              aria-label="Shares"
              value={row.shares || ""}
              onChange={(event) => updateShares(index, event.target.value)}
              className={`w-24 tabular-nums ${inputClass}`}
            />
            <input
              type="number"
              min="0"
              step="any"
              placeholder="Avg cost"
              aria-label="Average cost per share"
              value={row.avgCost ?? ""}
              onChange={(event) => updateAvgCost(index, event.target.value)}
              className={`w-32 tabular-nums ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="rounded-lg px-3 py-2 text-slate-500 transition hover:bg-slate-800 hover:text-red-400"
              aria-label={`Remove ${row.symbol || "row"}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Average cost is optional — leave it blank and you&apos;ll still get risk
        metrics, just no profit/loss or breakeven-aware stops.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Stock
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
        >
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
          Paste holdings
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-black transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze Portfolio"}
        </button>
      </div>

      <PortfolioImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApply={applyImported}
      />
    </form>
  );
}
