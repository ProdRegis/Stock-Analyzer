export const DEFAULT_SCAN_UNIVERSE = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "NVDA",
  "META",
  "TSLA",
  "AMD",
  "NFLX",
  "CRM",
  "JPM",
  "V",
  "MA",
  "DIS",
  "PYPL",
  "INTC",
  "QCOM",
  "AVGO",
  "COST",
  "UNH",
  "BA",
  "XOM",
  "LLY",
  "WMT",
  "ORCL",
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
