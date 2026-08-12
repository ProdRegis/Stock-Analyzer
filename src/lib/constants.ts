/**
 * Symbols the scanners sweep when no specific ticker is given.
 *
 * Breadth is what makes a scan useful: only a fraction of names are dipping or
 * near a breakout on any given day, so a small universe returns almost nothing
 * in a calm market. Kept to liquid large caps spread across sectors, since
 * thin names produce unreliable support levels and noisy signals.
 */
export const DEFAULT_SCAN_UNIVERSE = [
  // Technology
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL",
  "CRM", "ADBE", "AMD", "INTC", "QCOM", "TXN", "MU", "AMAT", "NFLX", "CSCO",
  "IBM", "NOW", "INTU", "PANW", "SNOW", "UBER", "ABNB", "SHOP", "PLTR", "ARM",
  // Financials
  "JPM", "BAC", "WFC", "GS", "MS", "V", "MA", "AXP", "SCHW", "BLK", "C",
  "PYPL", "COIN",
  // Healthcare
  "UNH", "LLY", "JNJ", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "AMGN",
  "BMY", "CVS", "ISRG",
  // Consumer
  "WMT", "COST", "HD", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "TGT", "LOW",
  "DIS", "CMG",
  // Industrials and energy
  "BA", "CAT", "GE", "HON", "UPS", "LMT", "RTX", "DE", "XOM", "CVX", "COP",
  "SLB",
  // Utilities, real estate, materials
  "NEE", "DUK", "SO", "AMT", "PLD", "LIN",
];

export const PORTFOLIO_STORAGE_KEY = "portfolio-risk-analyzer:saved-portfolios";

export const WORKING_PORTFOLIO_STORAGE_KEY =
  "portfolio-risk-analyzer:working-portfolio";

export const PROFILES_STORAGE_KEY = "portfolio-risk-analyzer:profiles";

export const ACTIVE_PROFILE_STORAGE_KEY =
  "portfolio-risk-analyzer:active-profile";

export const SESSION_STARTED_STORAGE_KEY =
  "portfolio-risk-analyzer:session-started";

/**
 * Keys holding per-person data. Each is suffixed with the profile id, so
 * switching profiles swaps the whole set. Add new personal data keys here and
 * they are namespaced, migrated, and cleaned up on delete automatically.
 */
export const PROFILE_SCOPED_KEYS = [
  PORTFOLIO_STORAGE_KEY,
  WORKING_PORTFOLIO_STORAGE_KEY,
] as const;
