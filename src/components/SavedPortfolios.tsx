"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { usePersistentStore } from "@/hooks/usePersistentStore";
import {
  createPortfolioId,
  deletePortfolio,
  savePortfolio,
  savedPortfoliosStore,
} from "@/lib/portfolios";
import type { PortfolioHolding, SavedPortfolio } from "@/lib/types";

interface SavedPortfoliosProps {
  currentHoldings: PortfolioHolding[];
  onLoadPortfolio: (holdings: PortfolioHolding[]) => void;
}

const inputClass =
  "flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";

export default function SavedPortfolios({
  currentHoldings,
  onLoadPortfolio,
}: SavedPortfoliosProps) {
  const portfolios = usePersistentStore(savedPortfoliosStore);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function handleSave(event: React.FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    const validHoldings = currentHoldings.filter(
      (holding) => holding.symbol.trim().length > 0 && holding.shares > 0
    );

    if (!trimmedName) {
      setMessage("Enter a portfolio name before saving.");
      return;
    }

    if (validHoldings.length === 0) {
      setMessage("Add at least one stock with shares before saving.");
      return;
    }

    const now = new Date().toISOString();
    const portfolio: SavedPortfolio = {
      id: createPortfolioId(),
      name: trimmedName,
      holdings: validHoldings,
      createdAt: now,
      updatedAt: now,
    };

    const next = savePortfolio(portfolio);
    savedPortfoliosStore.sync(next);
    setName("");
    setMessage(`Saved "${trimmedName}".`);
  }

  function handleUpdate(portfolio: SavedPortfolio) {
    const validHoldings = currentHoldings.filter(
      (holding) => holding.symbol.trim().length > 0 && holding.shares > 0
    );

    if (validHoldings.length === 0) {
      setMessage("Add stocks to the editor before updating a portfolio.");
      return;
    }

    const updated: SavedPortfolio = {
      ...portfolio,
      holdings: validHoldings,
      updatedAt: new Date().toISOString(),
    };

    const next = savePortfolio(updated);
    savedPortfoliosStore.sync(next);
    setMessage(`Updated "${portfolio.name}".`);
  }

  function handleLoad(portfolio: SavedPortfolio) {
    onLoadPortfolio(portfolio.holdings);
    setMessage(`Loaded "${portfolio.name}" into the portfolio editor.`);
  }

  function handleDelete(id: string, portfolioName: string) {
    const next = deletePortfolio(id);
    savedPortfoliosStore.sync(next);
    setMessage(`Deleted "${portfolioName}".`);
  }

  return (
    <section className="surface-2 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
        <Bookmark className="h-5 w-5 text-slate-500" aria-hidden="true" />
        Saved Portfolios
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Create and save portfolios locally in your browser. They persist between
        visits on this device.
      </p>

      <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Portfolio name (e.g. Retirement, Growth)"
          className={inputClass}
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-black transition hover:bg-emerald-500"
        >
          Save Current Portfolio
        </button>
      </form>

      {message && (
        <p className="mt-3 text-sm text-slate-300">{message}</p>
      )}

      <div className="mt-5 space-y-3">
        {portfolios.length === 0 ? (
          <p className="text-sm text-slate-500">
            No saved portfolios yet. Build a portfolio above and save it here.
          </p>
        ) : (
          portfolios.map((portfolio) => (
            <div
              key={portfolio.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3"
            >
              <div>
                <p className="font-medium text-white">{portfolio.name}</p>
                <p className="text-xs text-slate-400">
                  {portfolio.holdings.length} stock
                  {portfolio.holdings.length === 1 ? "" : "s"} · Updated{" "}
                  {new Date(portfolio.updatedAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {portfolio.holdings
                    .map(
                      (holding) =>
                        `${holding.symbol} (${holding.shares})`
                    )
                    .join(", ")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleLoad(portfolio)}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-700"
                >
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdate(portfolio)}
                  className="rounded-lg border border-blue-500/40 px-3 py-1.5 text-sm text-blue-300 transition hover:bg-blue-500/10"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(portfolio.id, portfolio.name)}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-sm text-red-300 transition hover:bg-red-500/10"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
