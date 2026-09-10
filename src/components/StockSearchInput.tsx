"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { MarketSearchResult } from "@/lib/types";

/** Stable identity so deriving "no results" doesn't churn referential equality. */
const NO_RESULTS: MarketSearchResult[] = [];

export async function resolveStockQuery(
  query: string,
  selected: MarketSearchResult | null
): Promise<MarketSearchResult | null> {
  if (selected) return selected;

  let trimmed = query.trim();
  if (!trimmed) return null;

  if (trimmed.includes(" — ")) {
    trimmed = trimmed.split(" — ")[0]?.trim() ?? trimmed;
  }

  const response = await fetch(
    `/api/market/search?q=${encodeURIComponent(trimmed)}`,
    { cache: "no-store" }
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Search failed");
  }

  const results = (data.results ?? []) as MarketSearchResult[];
  const upper = trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();

  const exactSymbol = results.find(
    (result) => result.symbol.toUpperCase() === upper
  );
  if (exactSymbol) return exactSymbol;

  const exactName = results.find(
    (result) => result.name.toLowerCase() === lower
  );
  if (exactName) return exactName;

  const nameStarts = results.find((result) =>
    result.name.toLowerCase().startsWith(lower)
  );
  if (nameStarts) return nameStarts;

  const nameContains = results.find((result) =>
    result.name.toLowerCase().includes(lower)
  );
  if (nameContains) return nameContains;

  if (results.length > 0) return results[0];

  const compact = trimmed.replace(/\s/g, "");
  if (
    results.length === 0 &&
    /^[A-Za-z]{1,5}(\.[A-Za-z]{1,2})?$/.test(compact)
  ) {
    return {
      symbol: compact.toUpperCase(),
      name: compact.toUpperCase(),
      exchange: "—",
      type: "Equity",
    };
  }

  return null;
}

interface StockSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (result: MarketSearchResult) => void;
  onClearSelection?: () => void;
  selected?: MarketSearchResult | null;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  /** When false, typing won't call onClearSelection (avoids parent re-renders). */
  clearSelectionOnType?: boolean;
  /** Called when the input loses focus (e.g. to commit typed text). */
  onBlurCommit?: () => void;
}

export default function StockSearchInput({
  value,
  onChange,
  onSelect,
  onClearSelection,
  selected = null,
  placeholder = "Search ticker or company (e.g. AAPL, Tesla)",
  className = "",
  inputClassName = "",
  autoFocus = false,
  disabled = false,
  id,
  clearSelectionOnType = true,
  onBlurCommit,
}: StockSearchInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listboxId = `${inputId}-listbox`;

  const [storedResults, setResults] = useState<MarketSearchResult[]>([]);
  const [storedSearching, setSearching] = useState(false);
  const [storedOpen, setOpen] = useState(false);
  const [storedActiveIndex, setActiveIndex] = useState(-1);
  const [storedSearchError, setSearchError] = useState<string | null>(null);

  // An empty or disabled input shows nothing at all, which is a property of the
  // current value rather than state worth storing. Deriving it keeps the effect
  // below responsible only for fetching.
  const inactive = disabled || value.trim().length < 1;
  const results = inactive ? NO_RESULTS : storedResults;
  const searching = inactive ? false : storedSearching;
  const searchError = inactive ? null : storedSearchError;
  const open = !inactive && storedOpen;
  const activeIndex = inactive ? -1 : storedActiveIndex;

  const blurTimeout = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const pickResult = useCallback(
    (result: MarketSearchResult) => {
      onSelect(result);
      onChange(`${result.symbol} — ${result.name}`);
      closeDropdown();
    },
    [closeDropdown, onChange, onSelect]
  );

  useEffect(() => {
    if (inactive) return;

    if (
      selected &&
      value.trim().toUpperCase().startsWith(selected.symbol.toUpperCase())
    ) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/market/search?q=${encodeURIComponent(value.trim())}`,
          { cache: "no-store" }
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Search failed");
        }

        const nextResults = (data.results ?? []) as MarketSearchResult[];
        setResults(nextResults);
        setOpen(nextResults.length > 0);
        setActiveIndex(nextResults.length > 0 ? 0 : -1);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
        closeDropdown();
      } finally {
        setSearching(false);
      }
    }, 280);

    return () => window.clearTimeout(timeout);
  }, [closeDropdown, inactive, selected, value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeDropdown]);

  function handleFocus() {
    if (blurTimeout.current) {
      window.clearTimeout(blurTimeout.current);
      blurTimeout.current = null;
    }
    if (results.length > 0) setOpen(true);
  }

  function handleBlur() {
    blurTimeout.current = window.setTimeout(() => {
      closeDropdown();
      onBlurCommit?.();
    }, 150);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open && results.length > 0) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((current) =>
        results.length === 0 ? -1 : (current + 1) % results.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0
          ? -1
          : (current - 1 + results.length) % results.length
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (open && activeIndex >= 0 && results[activeIndex]) {
        pickResult(results[activeIndex]);
        return;
      }
      if (results[0]) {
        pickResult(results[0]);
      }
      return;
    }

    if (event.key === "Escape") {
      closeDropdown();
    }
  }

  const defaultInputClass =
    "w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(event) => {
            if (clearSelectionOnType) {
              onClearSelection?.();
            }
            onChange(event.target.value);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`${defaultInputClass} ${inputClassName} ${selected ? "pr-20" : ""}`}
        />
        {selected && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
            {selected.symbol}
          </span>
        )}
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-900 shadow-xl"
        >
          {searching && (
            <p className="px-4 py-3 text-sm text-slate-500">Searching...</p>
          )}
          {!searching &&
            results.map((result, index) => (
              <button
                key={`${result.symbol}-${result.exchange}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickResult(result)}
                className={`flex w-full items-center justify-between border-b border-slate-800 px-4 py-3 text-left transition last:border-b-0 ${
                  index === activeIndex ? "bg-slate-800" : "hover:bg-slate-800/80"
                }`}
              >
                <div className="min-w-0 pr-3">
                  <p className="font-medium text-white">{result.symbol}</p>
                  <p className="truncate text-sm text-slate-500">{result.name}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-500">{result.exchange}</p>
                  <p className="text-xs text-slate-600">{result.type}</p>
                </div>
              </button>
            ))}
          {!searching && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">No matches found.</p>
          )}
        </div>
      )}

      {searchError && !open && (
        <p className="mt-1 text-xs text-red-400">{searchError}</p>
      )}
    </div>
  );
}
