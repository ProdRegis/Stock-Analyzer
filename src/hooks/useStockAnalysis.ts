"use client";

import { useEffect, useState } from "react";
import type { StockAnalysis } from "@/lib/types";

type CacheEntry = {
  data?: StockAnalysis;
  error?: string;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<void>>();

async function loadStockAnalysis(symbol: string): Promise<void> {
  const upper = symbol.toUpperCase();

  if (cache.has(upper) && (cache.get(upper)?.data || cache.get(upper)?.error)) {
    return;
  }

  if (inFlight.has(upper)) {
    return inFlight.get(upper)!;
  }

  const request = (async () => {
    try {
      const response = await fetch(`/api/stock/${upper}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load stock data");
      }

      cache.set(upper, { data: payload as StockAnalysis });
    } catch (err) {
      cache.set(upper, {
        error: err instanceof Error ? err.message : "Failed to load stock data",
      });
    } finally {
      inFlight.delete(upper);
    }
  })();

  inFlight.set(upper, request);
  return request;
}

export function useStockAnalysis(symbol: string) {
  const upper = symbol.toUpperCase();
  const [entry, setEntry] = useState<CacheEntry>(() => cache.get(upper) ?? {});

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await loadStockAnalysis(upper);
      if (!cancelled) {
        setEntry(cache.get(upper) ?? {});
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [upper]);

  return {
    analysis: entry.data,
    error: entry.error,
    loading: !entry.data && !entry.error,
  };
}
