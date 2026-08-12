import type { PortfolioHolding, SavedPortfolio } from "./types";
import {
  PORTFOLIO_STORAGE_KEY,
  WORKING_PORTFOLIO_STORAGE_KEY,
} from "./constants";
import { createPersistentStore } from "./persistent-store";

export function loadSavedPortfolios(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPortfolio[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistPortfolios(portfolios: SavedPortfolio[]): void {
  localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(portfolios));
}

export function savePortfolio(portfolio: SavedPortfolio): SavedPortfolio[] {
  const existing = loadSavedPortfolios();
  const index = existing.findIndex((item) => item.id === portfolio.id);
  const next =
    index >= 0
      ? existing.map((item, i) => (i === index ? portfolio : item))
      : [...existing, portfolio];

  persistPortfolios(next);
  return next;
}

export function deletePortfolio(id: string): SavedPortfolio[] {
  const next = loadSavedPortfolios().filter((item) => item.id !== id);
  persistPortfolios(next);
  return next;
}

export function createPortfolioId(): string {
  return `portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isHolding(value: unknown): value is PortfolioHolding {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.symbol === "string" && typeof record.shares === "number"
  );
}

/** The in-progress portfolio in the editor, restored across page reloads. */
export function loadWorkingPortfolio(): PortfolioHolding[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(WORKING_PORTFOLIO_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const holdings = parsed.filter(isHolding).map((holding) => ({
      symbol: holding.symbol,
      shares: holding.shares,
      avgCost:
        typeof holding.avgCost === "number" && holding.avgCost > 0
          ? holding.avgCost
          : undefined,
    }));

    return holdings.length > 0 ? holdings : null;
  } catch {
    return null;
  }
}

export function saveWorkingPortfolio(
  holdings: PortfolioHolding[] | null
): void {
  if (typeof window === "undefined" || holdings === null) return;

  try {
    localStorage.setItem(
      WORKING_PORTFOLIO_STORAGE_KEY,
      JSON.stringify(holdings)
    );
  } catch {
    // Storage can be full or blocked; the editor still works in-memory.
  }
}

/** Editor contents, shared so any component reads the same restored value. */
export const workingPortfolioStore = createPersistentStore<
  PortfolioHolding[] | null
>(loadWorkingPortfolio, saveWorkingPortfolio, null);

export const savedPortfoliosStore = createPersistentStore<SavedPortfolio[]>(
  loadSavedPortfolios,
  persistPortfolios,
  []
);
