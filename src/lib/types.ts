export type SellReasonCategory =
  | "calculation"
  | "technical"
  | "news"
  | "event"
  | "prediction";

export interface SellReasonDetail {
  id: string;
  category: SellReasonCategory;
  title: string;
  detail: string;
}

export type StopLossReasonCategory =
  | "calculation"
  | "technical"
  | "historical"
  | "selection";

export interface StopLossReasonDetail {
  id: string;
  category: StopLossReasonCategory;
  title: string;
  detail: string;
}

export interface StopLossRecommendation {
  symbol: string;
  name: string;
  direction: TradeDirection;
  currentPrice: number;
  shares: number | null;
  positionValue: number | null;
  maxLossDollars: number | null;
  avgCost: number | null;
  costBasis: number | null;
  /** Gain (+) or loss (−) in dollars versus cost basis if the stop triggers. */
  outcomeAtStopDollars: number | null;
  outcomeAtStopPercent: number | null;
  /** True when triggering the stop would still realize a profit. */
  stopLocksInGain: boolean;
  nearestSupport: ResistanceLevel | null;
  nearestResistance: ResistanceLevel | null;
  supportLevels: ResistanceLevel[];
  resistanceLevels: ResistanceLevel[];
  history: PricePoint[];
  marketState: string;
  lastUpdated: string;
  stopLossPrice: number;
  stopLossPercent: number;
  stopLossLabel: string;
  stopLossReason: string;
  stopLossCalculation: string;
  stopLossReasons: StopLossReasonDetail[];
  stopLossWinningMethod: string;
}

export interface SymbolHeadline {
  title: string;
  impact: "High" | "Medium" | "Low";
  publishedAt: string;
}

export interface SymbolUpcomingEvent {
  type: "earnings" | "dividend" | "earnings_call";
  date: string;
  label: string;
}

export interface SymbolMarketContext {
  headlines: SymbolHeadline[];
  events: SymbolUpcomingEvent[];
}

export interface PastBreakout {
  date: string;
  resistanceLevel: number;
  breakoutPrice: number;
  volumeRatio: number;
  followThrough5d: number;
  followThrough10d: number;
  successful: boolean;
}

export interface BreakoutCandidate {
  symbol: string;
  name: string;
  currentPrice: number;
  changePercent: number;
  likelihoodScore: number;
  nearestResistance: ResistanceLevel | null;
  distanceToResistance: number;
  historicalSuccessRate: number;
  pastBreakouts: PastBreakout[];
  history: PricePoint[];
  intradayHistory: PricePoint[];
  resistanceLevels: ResistanceLevel[];
  breakout: BreakoutSignal;
  marketState: string;
  lastUpdated: string;
  /** How solid the underlying business looks, independent of the chart. */
  businessQuality?: BusinessQuality;
}

export type TradeDirection = "long" | "short";

/** How strict the dip scanner's screen is. Thresholds live in the scanner. */
export type DipSensitivity = "strict" | "balanced" | "broad";

/** Selectable spans on a price chart. */
export type ChartRange = "1D" | "7D" | "1M" | "3M" | "1Y" | "5Y";

export const CHART_RANGES: ChartRange[] = ["1D", "7D", "1M", "3M", "1Y", "5Y"];

/** Bar sizes the chart endpoint can return. */
export type ChartInterval = "1m" | "15m" | "1d" | "1wk";

export type BuyTimingWindow =
  | "now"
  | "tomorrow"
  | "2-3_days"
  | "this_week"
  | "1-2_weeks"
  | "wait";

export interface PastDipRecovery {
  date: string;
  dipPercent: number;
  supportLevel: number;
  recoveryDays: number;
  recoveredFully: boolean;
  gain10d: number;
}

export interface DipCandidate {
  symbol: string;
  name: string;
  direction: TradeDirection;
  currentPrice: number;
  changePercent: number;
  dipPercent: number;
  recoveryScore: number;
  rsi: number;
  nearestSupport: ResistanceLevel | null;
  nearestResistance: ResistanceLevel | null;
  distanceToSupport: number;
  historicalRecoveryRate: number;
  avgRecoveryDays: number;
  pastDips: PastDipRecovery[];
  buyTiming: BuyTimingWindow;
  buyTimingLabel: string;
  predictedRecoveryDate: string;
  predictedRecoveryLabel: string;
  buyReason: string;
  predictionReason: string;
  sellTiming: BuyTimingWindow;
  sellTimingLabel: string;
  predictedSellDate: string;
  predictedSellLabel: string;
  sellTargetPrice: number | null;
  sellReason: string;
  sellPredictionReason: string;
  sellReasons: SellReasonDetail[];
  marketContext: SymbolMarketContext;
  stopLossPrice: number;
  stopLossPercent: number;
  stopLossLabel: string;
  stopLossReason: string;
  stopLossCalculation: string;
  stopLossReasons: StopLossReasonDetail[];
  stopLossWinningMethod: string;
  history: PricePoint[];
  intradayHistory: PricePoint[];
  supportLevels: ResistanceLevel[];
  resistanceLevels: ResistanceLevel[];
  marketState: string;
  lastUpdated: string;
  /** How solid the underlying business looks, independent of the chart. */
  businessQuality?: BusinessQuality;
}

export interface MarketSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export interface MarketCompanyDetails {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
  marketTime: string | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  previousClose: number | null;
  open: number | null;
  marketCap: number | null;
  peRatio: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  summary: string | null;
  intradayHistory: PricePoint[];
}

export interface UpcomingMarketEvent {
  symbol: string;
  name: string;
  type: "earnings" | "dividend" | "earnings_call";
  date: string;
  earningsEstimate?: {
    low?: number;
    high?: number;
    avg?: number;
  };
}

export interface StockImpactAnalysis {
  symbol: string;
  companyName?: string;
  relationship: "direct" | "sector" | "market-wide";
  confidence: "High" | "Medium" | "Low";
  ifPositive: string;
  ifNegative: string;
  positiveChance: number;
  negativeChance: number;
  chanceCalculation: string;
}

export interface NewsArticle {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: string;
  relatedTickers: string[];
  stockImpacts: StockImpactAnalysis[];
  category:
    | "earnings"
    | "macro"
    | "mergers"
    | "markets"
    | "investments"
    | "general";
  impact: "High" | "Medium" | "Low";
  thumbnail?: string;
}

export interface NewsFeed {
  fetchedAt: string;
  articles: NewsArticle[];
  upcomingEvents: UpcomingMarketEvent[];
}

export interface SavedPortfolio {
  id: string;
  name: string;
  holdings: PortfolioHolding[];
  createdAt: string;
  updatedAt: string;
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MovingAverages {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
}

export interface ResistanceLevel {
  price: number;
  strength: number;
  touches: number;
  label: string;
}

export interface BreakoutSignal {
  level: number;
  type: "bullish" | "bearish" | "none";
  description: string;
  confidence: number;
}

export interface MetricSources {
  prices: string;
  benchmark: string;
  riskFreeRate: string;
  beta: string;
  volatility: string;
  sharpe: string;
}

/** OLS of this series on SPY: r, R² = r², and a 95% interval for beta. */
export interface RegressionStats {
  n: number;
  r: number;
  rSquared: number;
  betaStdError: number;
  betaCiLow: number;
  betaCiHigh: number;
}

export type BusinessQualityGrade = "Durable" | "Fair" | "Speculative" | "Pass";

/** Fundamental grade for the business, not the chart. */
export interface BusinessQuality {
  grade: BusinessQualityGrade;
  summary: string;
  flags: string[];
  hardIndustry: boolean;
}

export type ThesisStance = "buy" | "wait" | "hold-study" | "pass";

export type ThesisValuationMethod = "fcf" | "earnings" | "unavailable";

export interface ThesisScreenFlag {
  label: string;
  tone: "good" | "warn" | "bad";
}

export interface ThesisPeer {
  symbol: string;
  name: string;
  grade: BusinessQualityGrade | null;
  note: string;
}

export interface ThesisDcfYear {
  year: number;
  growth: number;
  cashFlow: number;
  presentValue: number;
}

export interface ThesisGrowthScenario {
  id: "harsh" | "conservative" | "reported";
  label: string;
  growth: number;
  impliedReturn: number | null;
  buyPrice: number | null;
}

export interface NotableHolder {
  person: string;
  filerName: string;
  cik: string;
  weight: number;
}

export interface InvestmentThesis {
  symbol: string;
  name: string;
  currentPrice: number;
  currency: string;
  sector: string | null;
  industry: string | null;
  summary: string | null;
  quality: BusinessQuality;
  screen: {
    kickOut: boolean;
    kickOutReason: string | null;
    flags: ThesisScreenFlag[];
  };
  createValue: string;
  captureValue: string;
  protectValue: string;
  thesis: string;
  bearCase: string[];
  valuation: {
    method: ThesisValuationMethod;
    startingCashFlow: number | null;
    conservativeGrowth: number | null;
    impliedReturn: number | null;
    hurdleRate: number;
    sellRate: number;
    riskFreeRate: number;
    attractive: boolean;
    buyPrice: number | null;
    sellPrice: number | null;
    forwardPe: number | null;
    yearsToMarketMultiple: number | null;
    explanation: string;
    schedule: ThesisDcfYear[] | null;
    terminalPresentValue: number | null;
    scenarios: ThesisGrowthScenario[];
  };
  plan: {
    stance: ThesisStance;
    whenToBuy: string;
    buyAt: number | null;
    whenToSell: string;
    sellAt: number | null;
  };
  peers: ThesisPeer[];
  notableHolders: NotableHolder[];
  sources: string[];
}

export interface StockRiskMetrics {
  annualizedVolatility: number;
  beta: number;
  maxDrawdown: number;
  sharpeRatio: number;
  riskScore: number;
  riskLevel: "Low" | "Moderate" | "High" | "Very High";
  metricSources?: MetricSources;
  regression?: RegressionStats;
}

export interface StockAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  currency: string;
  changePercent: number;
  history: PricePoint[];
  movingAverages: MovingAverages;
  resistanceLevels: ResistanceLevel[];
  supportLevels: ResistanceLevel[];
  breakout: BreakoutSignal;
  risk: StockRiskMetrics;
}

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  /** Average price paid per share. Undefined when the user hasn't entered one. */
  avgCost?: number;
  /** Take-profit price the owner wants to be reminded to sell at. */
  targetPrice?: number;
  /** Calendar date (YYYY-MM-DD) the owner wants to be reminded to sell by. */
  targetDate?: string;
}

export interface PortfolioPositionPnl {
  avgCost: number;
  costBasis: number;
  unrealizedGain: number;
  unrealizedGainPercent: number;
}

export interface PortfolioAnalysis {
  holdings: Array<{
    symbol: string;
    shares: number;
    weight: number;
    value: number;
    pnl: PortfolioPositionPnl | null;
    analysis: StockAnalysis;
  }>;
  totalValue: number;
  totalCostBasis: number | null;
  totalUnrealizedGain: number | null;
  totalUnrealizedGainPercent: number | null;
  /** True when every holding has a cost basis, so totals cover the whole portfolio. */
  costBasisComplete: boolean;
  portfolioRisk: {
    annualizedVolatility: number;
    beta: number;
    riskScore: number;
    riskLevel: "Low" | "Moderate" | "High" | "Very High";
    diversificationScore: number;
    concentrationRisk: number;
    avgCorrelation: number;
    avgPairRSquared: number;
    alignedDays: number;
    regression?: RegressionStats;
    correlationSymbols: string[];
    correlationMatrix: number[][];
  };
}

/** One row from a Form 13F information table, after merging duplicate CUSIPs. */
export interface ThirteenFHolding {
  issuer: string;
  titleOfClass: string;
  cusip: string;
  /** Market value in USD (13F reports thousands; this is × 1,000). */
  valueUsd: number;
  shares: number;
  shareType: string;
  putCall: string | null;
  weight: number;
  /** Yahoo ticker when the issuer name resolved. */
  ticker: string | null;
}

export type ThirteenFTradeAction = "opened" | "added" | "reduced" | "exited";

export interface ThirteenFTrade {
  action: ThirteenFTradeAction;
  issuer: string;
  cusip: string;
  putCall: string | null;
  sharesBefore: number;
  sharesAfter: number;
  valueUsdBefore: number;
  valueUsdAfter: number;
  shareChange: number;
  valueChangeUsd: number;
  ticker: string | null;
}

export interface ThirteenFPeriod {
  reportDate: string;
  filingDate: string;
  accession: string;
  form: string;
  documentUrl: string;
}

export interface NotableInvestor {
  cik: string;
  filerName: string;
  person: string;
  aliases: string[];
}

export interface ThirteenFSearchHit {
  cik: string;
  name: string;
  person: string | null;
  source: "notable" | "edgar";
}

export interface ThirteenFFilerReport {
  cik: string;
  filerName: string;
  person: string | null;
  period: ThirteenFPeriod;
  previousPeriod: ThirteenFPeriod | null;
  totalValueUsd: number;
  holdingCount: number;
  tradeCount: number;
  openedCount: number;
  holdings: ThirteenFHolding[];
  trades: ThirteenFTrade[];
  /** Largest new positions this quarter, pinned above the change list. */
  opened: ThirteenFTrade[];
  query: string | null;
  matchCount: number | null;
  sourceUrl: string;
}
