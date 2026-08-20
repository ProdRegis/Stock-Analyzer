import type { ThesisStance } from "./types";
import {
  LAST_COPY_TRADER_STORAGE_KEY,
  RECENT_THESES_STORAGE_KEY,
} from "./constants";
import { createPersistentStore } from "./persistent-store";
import {
  activeProfileStore,
  profileScopedKey,
  registerProfileScopedStore,
} from "./profiles";

function activeKey(baseKey: string): string | null {
  const profileId = activeProfileStore.getSnapshot();
  return profileId === null ? null : profileScopedKey(baseKey, profileId);
}

export interface RecentThesis {
  symbol: string;
  name: string;
  stance: ThesisStance;
  buyAt: number | null;
  at: number;
}

export const MAX_RECENT_THESES = 8;

function isRecentThesis(value: unknown): value is RecentThesis {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.symbol === "string" &&
    typeof record.name === "string" &&
    typeof record.stance === "string" &&
    typeof record.at === "number" &&
    (record.buyAt === null || typeof record.buyAt === "number")
  );
}

export function loadRecentTheses(): RecentThesis[] {
  if (typeof window === "undefined") return [];
  const key = activeKey(RECENT_THESES_STORAGE_KEY);
  if (key === null) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentThesis) : [];
  } catch {
    return [];
  }
}

export function persistRecentTheses(items: RecentThesis[]): void {
  if (typeof window === "undefined") return;
  const key = activeKey(RECENT_THESES_STORAGE_KEY);
  if (key === null) return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Storage full or blocked.
  }
}

export function rememberThesis(item: RecentThesis): RecentThesis[] {
  const next = [
    item,
    ...recentThesesStore
      .getSnapshot()
      .filter((row) => row.symbol.toUpperCase() !== item.symbol.toUpperCase()),
  ].slice(0, MAX_RECENT_THESES);
  recentThesesStore.set(next);
  return next;
}

export const recentThesesStore = createPersistentStore<RecentThesis[]>(
  loadRecentTheses,
  persistRecentTheses,
  []
);

export interface LastCopyTrader {
  cik: string;
  label: string;
}

function isLastCopyTrader(value: unknown): value is LastCopyTrader {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.cik === "string" && typeof record.label === "string";
}

export function loadLastCopyTrader(): LastCopyTrader | null {
  if (typeof window === "undefined") return null;
  const key = activeKey(LAST_COPY_TRADER_STORAGE_KEY);
  if (key === null) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLastCopyTrader(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistLastCopyTrader(value: LastCopyTrader | null): void {
  if (typeof window === "undefined") return;
  const key = activeKey(LAST_COPY_TRADER_STORAGE_KEY);
  if (key === null) return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked.
  }
}

export const lastCopyTraderStore = createPersistentStore<LastCopyTrader | null>(
  loadLastCopyTrader,
  persistLastCopyTrader,
  null
);

registerProfileScopedStore(recentThesesStore);
registerProfileScopedStore(lastCopyTraderStore);
