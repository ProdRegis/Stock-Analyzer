/**
 * Symbols the scanners sweep when no specific ticker is given.
 *
 * Breadth is what makes a scan useful: only a fraction of names are dipping or
 * near a breakout on any given day, so a small universe returns almost nothing
 * in a calm market. Kept to liquid large caps spread across sectors, since
 * thin names produce unreliable support levels and noisy signals.
 *
 * Grouped so the thesis tab can suggest other names in the same industry
 * without another Yahoo round-trip for sector classification.
 */
export const SCAN_UNIVERSE_GROUPS: Record<string, string[]> = {
  Technology: [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL",
    "CRM", "ADBE", "AMD", "INTC", "QCOM", "TXN", "MU", "AMAT", "NFLX", "CSCO",
    "IBM", "NOW", "INTU", "PANW", "SNOW", "UBER", "ABNB", "SHOP", "PLTR", "ARM",
  ],
  Financials: [
    "JPM", "BAC", "WFC", "GS", "MS", "V", "MA", "AXP", "SCHW", "BLK", "C",
    "PYPL", "COIN",
  ],
  Healthcare: [
    "UNH", "LLY", "JNJ", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "AMGN",
    "BMY", "CVS", "ISRG",
  ],
  Consumer: [
    "WMT", "COST", "HD", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "TGT", "LOW",
    "DIS", "CMG",
  ],
  "Industrials and energy": [
    "BA", "CAT", "GE", "HON", "UPS", "LMT", "RTX", "DE", "XOM", "CVX", "COP",
    "SLB",
  ],
  "Utilities, real estate, materials": ["NEE", "DUK", "SO", "AMT", "PLD", "LIN"],
};

export const DEFAULT_SCAN_UNIVERSE = Object.values(SCAN_UNIVERSE_GROUPS).flat();

/**
 * Names options educators actually start with: index/sector ETFs with penny
 * markets, then mega-caps that keep tight ATM books. Liquidity is the screen;
 * IV/RV is the rank. Not a "best stocks to buy" list.
 */
export const OPTIONS_SCREEN_UNIVERSE = [
  "SPY",
  "QQQ",
  "IWM",
  "DIA",
  "SMH",
  "XLF",
  "XLE",
  "XLK",
  "XLV",
  "GLD",
  "TLT",
  "HYG",
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "META",
  "GOOGL",
  "TSLA",
  "AMD",
  "AVGO",
  "NFLX",
  "JPM",
  "BAC",
  "GS",
  "COIN",
  "PLTR",
  "BA",
  "COST",
  "WMT",
  "INTC",
  "MU",
] as const;

export function peerSymbolsInUniverse(
  symbol: string,
  limit = 4
): { group: string; symbols: string[] } | null {
  const upper = symbol.toUpperCase();
  const entry = Object.entries(SCAN_UNIVERSE_GROUPS).find(([, symbols]) =>
    symbols.includes(upper)
  );
  if (!entry) return null;
  const [group, symbols] = entry;
  return {
    group,
    symbols: symbols.filter((item) => item !== upper).slice(0, limit),
  };
}

export const PORTFOLIO_STORAGE_KEY = "portfolio-risk-analyzer:saved-portfolios";

export const WORKING_PORTFOLIO_STORAGE_KEY =
  "portfolio-risk-analyzer:working-portfolio";

export const PROFILES_STORAGE_KEY = "portfolio-risk-analyzer:profiles";

export const ACTIVE_PROFILE_STORAGE_KEY =
  "portfolio-risk-analyzer:active-profile";

export const SESSION_STARTED_STORAGE_KEY =
  "portfolio-risk-analyzer:session-started";

export const RECENT_THESES_STORAGE_KEY =
  "portfolio-risk-analyzer:recent-theses";

export const LAST_COPY_TRADER_STORAGE_KEY =
  "portfolio-risk-analyzer:last-copy-trader";

export const LAST_OPTIONS_SYMBOL_STORAGE_KEY =
  "portfolio-risk-analyzer:last-options-symbol";

/**
 * Keys holding per-person data. Each is suffixed with the profile id, so
 * switching profiles swaps the whole set. Add new personal data keys here and
 * they are namespaced, migrated, and cleaned up on delete automatically.
 */
export const PROFILE_SCOPED_KEYS = [
  PORTFOLIO_STORAGE_KEY,
  WORKING_PORTFOLIO_STORAGE_KEY,
  RECENT_THESES_STORAGE_KEY,
  LAST_COPY_TRADER_STORAGE_KEY,
  LAST_OPTIONS_SYMBOL_STORAGE_KEY,
] as const;
