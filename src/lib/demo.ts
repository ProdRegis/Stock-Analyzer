import type { PortfolioHolding } from "./types";

/**
 * Sample portfolio shown before a visitor enters their own holdings.
 *
 * Deliberately spread across tech, financials, energy, and healthcare so the
 * correlation grid and diversification score have something real to say. Cost
 * bases are set well away from current prices so the profit and loss column is
 * populated rather than sitting at zero.
 */
export const DEMO_PORTFOLIO: PortfolioHolding[] = [
  { symbol: "AAPL", shares: 12, avgCost: 178.4 },
  { symbol: "MSFT", shares: 6, avgCost: 405.2 },
  { symbol: "NVDA", shares: 15, avgCost: 118.75 },
  { symbol: "JPM", shares: 9, avgCost: 214.6 },
  { symbol: "XOM", shares: 20, avgCost: 116.3 },
];
