"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import StockSearchInput, { resolveStockQuery } from "./StockSearchInput";
import type { MarketSearchResult } from "@/lib/types";

export type PortfolioSymbolInputHandle = {
  commit: () => Promise<string>;
};

interface PortfolioSymbolInputProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  inputClassName: string;
}

const PortfolioSymbolInput = forwardRef<
  PortfolioSymbolInputHandle,
  PortfolioSymbolInputProps
>(function PortfolioSymbolInput(
  { symbol, onSymbolChange, inputClassName },
  ref
) {
  const [query, setQuery] = useState(symbol);
  const [selected, setSelected] = useState<MarketSearchResult | null>(null);

  const commit = useCallback(async (): Promise<string> => {
    if (selected) {
      onSymbolChange(selected.symbol);
      return selected.symbol;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      onSymbolChange("");
      return "";
    }

    try {
      const resolved = await resolveStockQuery(trimmed, null);
      if (resolved) {
        setSelected(resolved);
        setQuery(`${resolved.symbol} — ${resolved.name}`);
        onSymbolChange(resolved.symbol);
        return resolved.symbol;
      }
    } catch {
      // Fall through to ticker fragment below.
    }

    const fallback =
      trimmed.split(" — ")[0]?.trim().toUpperCase() ?? trimmed.toUpperCase();
    onSymbolChange(fallback);
    return fallback;
  }, [onSymbolChange, query, selected]);

  useImperativeHandle(ref, () => ({ commit }), [commit]);

  useEffect(() => {
    if (!selected) {
      setQuery(symbol);
    }
  }, [symbol, selected]);

  return (
    <StockSearchInput
      className="flex-1"
      value={query}
      onChange={(value) => {
        setSelected(null);
        setQuery(value);
      }}
      selected={selected}
      onSelect={(result) => {
        setSelected(result);
        onSymbolChange(result.symbol);
        setQuery(`${result.symbol} — ${result.name}`);
      }}
      clearSelectionOnType={false}
      placeholder="Search ticker or company"
      inputClassName={inputClassName.replace(/^flex-1\s+/, "")}
      onBlurCommit={() => {
        void commit();
      }}
    />
  );
});

export default PortfolioSymbolInput;
