import type { NewsArticle, StockImpactAnalysis } from "./types";

const COMPANY_ALIASES: Record<string, string> = {
  apple: "AAPL",
  microsoft: "MSFT",
  google: "GOOGL",
  alphabet: "GOOGL",
  amazon: "AMZN",
  nvidia: "NVDA",
  meta: "META",
  facebook: "META",
  tesla: "TSLA",
  amd: "AMD",
  netflix: "NFLX",
  salesforce: "CRM",
  jpmorgan: "JPM",
  "jp morgan": "JPM",
  visa: "V",
  mastercard: "MA",
  disney: "DIS",
  paypal: "PYPL",
  intel: "INTC",
  qualcomm: "QCOM",
  broadcom: "AVGO",
  costco: "COST",
  unitedhealth: "UNH",
  boeing: "BA",
  exxon: "XOM",
  "exxonmobil": "XOM",
  "eli lilly": "LLY",
  lilly: "LLY",
  walmart: "WMT",
  oracle: "ORCL",
  berkshire: "BRK-B",
  "bank of america": "BAC",
  citigroup: "C",
  goldman: "GS",
  "goldman sachs": "GS",
  "morgan stanley": "MS",
  coinbase: "COIN",
  palantir: "PLTR",
  sofi: "SOFI",
  uber: "UBER",
  airbnb: "ABNB",
  shopify: "SHOP",
  snowflake: "SNOW",
};

const MACRO_SYMBOLS = ["SPY", "QQQ", "DIA"];
const FINANCIAL_SYMBOLS = ["JPM", "BAC", "GS", "MS", "XLF"];
const ENERGY_SYMBOLS = ["XOM", "CVX", "XLE"];
const TECH_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "META", "AMZN"];

const TICKER_IN_TITLE = /\b[A-Z]{1,5}\b/g;

type ScenarioType =
  | "earnings"
  | "merger_target"
  | "merger_acquirer"
  | "macro"
  | "analyst"
  | "general";

type TitleTone = "positive" | "negative" | "neutral";

const BASE_RATES: Record<
  ScenarioType,
  { positive: number; negative: number; label: string }
> = {
  earnings: {
    positive: 52,
    negative: 48,
    label: "historical S&P 500 earnings beat rate (~52% beat / 48% miss)",
  },
  merger_target: {
    positive: 62,
    negative: 38,
    label: "announced M&A target completion baseline (~62% close / 38% break)",
  },
  merger_acquirer: {
    positive: 44,
    negative: 56,
    label: "acquirer reaction baseline (~44% positive / 56% negative on deal news)",
  },
  macro: {
    positive: 50,
    negative: 50,
    label: "macro headline baseline (50/50 before tone adjustment)",
  },
  analyst: {
    positive: 50,
    negative: 50,
    label: "analyst-action baseline (50/50 before upgrade/downgrade tone)",
  },
  general: {
    positive: 46,
    negative: 54,
    label: "general news baseline (46% positive follow-through / 54% negative)",
  },
};

function clampChance(value: number): number {
  return Math.max(5, Math.min(95, Math.round(value)));
}

function detectTitleTone(title: string): TitleTone {
  const lower = title.toLowerCase();

  const positive = /beat|beats|surge|surges|rally|rallies|upgrade|upgraded|approval|approved|record high|soars|jumps|growth|strong results|raises guidance|bullish/.test(
    lower
  );
  const negative = /miss|misses|plunge|plunges|crash|crashes|downgrade|downgraded|lawsuit|investigation|recession|cuts guidance|warns|warning|bearish|slumps|falls|drop/.test(
    lower
  );

  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  return "neutral";
}

function relationshipAdjustment(
  relationship: StockImpactAnalysis["relationship"]
): { positive: number; negative: number; note: string } {
  switch (relationship) {
    case "direct":
      return { positive: 8, negative: 8, note: "+8 pts direct headline link" };
    case "sector":
      return { positive: -6, negative: -6, note: "-6 pts sector-level exposure" };
    case "market-wide":
      return {
        positive: -10,
        negative: -10,
        note: "-10 pts broad market exposure",
      };
  }
}

function confidenceAdjustment(
  confidence: StockImpactAnalysis["confidence"]
): { spread: number; note: string } {
  switch (confidence) {
    case "High":
      return { spread: 6, note: "+6 pt spread (high confidence)" };
    case "Medium":
      return { spread: 0, note: "no confidence spread adjustment" };
    case "Low":
      return { spread: -6, note: "-6 pt spread (low confidence, closer to 50/50)" };
  }
}

function impactAdjustment(impact: NewsArticle["impact"]): {
  value: number;
  note: string;
} {
  switch (impact) {
    case "High":
      return { value: 5, note: "+5 pts high headline impact" };
    case "Medium":
      return { value: 2, note: "+2 pts medium headline impact" };
    case "Low":
      return { value: 0, note: "no impact-level adjustment" };
  }
}

function toneAdjustment(tone: TitleTone): {
  positive: number;
  negative: number;
  note: string;
} {
  switch (tone) {
    case "positive":
      return {
        positive: 12,
        negative: -12,
        note: "+12 pts positive headline tone / -12 pts negative",
      };
    case "negative":
      return {
        positive: -12,
        negative: 12,
        note: "-12 pts positive / +12 pts negative headline tone",
      };
    case "neutral":
      return {
        positive: 0,
        negative: 0,
        note: "neutral headline tone",
      };
  }
}

function analystToneAdjustment(title: string): {
  positive: number;
  negative: number;
  note: string;
} {
  const lower = title.toLowerCase();
  if (/upgrade|raised target|overweight|buy rating/.test(lower)) {
    return {
      positive: 18,
      negative: -18,
      note: "headline signals analyst upgrade (+18 / -18)",
    };
  }
  if (/downgrade|cut target|underweight|sell rating/.test(lower)) {
    return {
      positive: -18,
      negative: 18,
      note: "headline signals analyst downgrade (-18 / +18)",
    };
  }
  return toneAdjustment(detectTitleTone(title));
}

function normalizePair(positive: number, negative: number): {
  positiveChance: number;
  negativeChance: number;
} {
  const pos = clampChance(positive);
  const neg = clampChance(negative);
  const total = pos + neg || 1;
  return {
    positiveChance: clampChance((pos / total) * 100),
    negativeChance: clampChance((neg / total) * 100),
  };
}

function calculateScenarioChances(params: {
  category: NewsArticle["category"];
  relationship: StockImpactAnalysis["relationship"];
  confidence: StockImpactAnalysis["confidence"];
  articleImpact: NewsArticle["impact"];
  title: string;
  scenarioType: ScenarioType;
}): Pick<
  StockImpactAnalysis,
  "positiveChance" | "negativeChance" | "chanceCalculation"
> {
  const base = BASE_RATES[params.scenarioType];
  let positive = base.positive;
  let negative = base.negative;
  const steps: string[] = [`Base: ${base.label} (${base.positive}/${base.negative})`];

  const rel = relationshipAdjustment(params.relationship);
  positive += rel.positive;
  negative += rel.negative;
  steps.push(rel.note);

  const impact = impactAdjustment(params.articleImpact);
  positive += impact.value;
  negative += impact.value;
  steps.push(impact.note);

  const tone =
    params.scenarioType === "analyst"
      ? analystToneAdjustment(params.title)
      : toneAdjustment(detectTitleTone(params.title));
  positive += tone.positive;
  negative += tone.negative;
  steps.push(tone.note);

  const conf = confidenceAdjustment(params.confidence);
  if (conf.spread !== 0) {
    if (positive >= negative) {
      positive += conf.spread / 2;
      negative -= conf.spread / 2;
    } else {
      positive -= conf.spread / 2;
      negative += conf.spread / 2;
    }
    steps.push(conf.note);
  }

  const normalized = normalizePair(positive, negative);
  steps.push(
    `Normalized to ${normalized.positiveChance}% positive / ${normalized.negativeChance}% negative`
  );

  return {
    ...normalized,
    chanceCalculation: steps.join(". ") + ".",
  };
}

function withChances(
  impact: Omit<
    StockImpactAnalysis,
    "positiveChance" | "negativeChance" | "chanceCalculation"
  >,
  article: Pick<NewsArticle, "title" | "category" | "impact">,
  scenarioType: ScenarioType
): StockImpactAnalysis {
  const chances = calculateScenarioChances({
    category: article.category,
    relationship: impact.relationship,
    confidence: impact.confidence,
    articleImpact: article.impact,
    title: article.title,
    scenarioType,
  });

  return { ...impact, ...chances };
}

function detectSymbolsFromTitle(title: string): string[] {
  const lower = title.toLowerCase();
  const symbols = new Set<string>();

  for (const [name, symbol] of Object.entries(COMPANY_ALIASES)) {
    if (lower.includes(name)) symbols.add(symbol);
  }

  const tickerMatches = title.match(TICKER_IN_TITLE) ?? [];
  const skipWords = new Set([
    "A",
    "I",
    "AI",
    "US",
    "UK",
    "EU",
    "CEO",
    "CFO",
    "IPO",
    "ETF",
    "GDP",
    "FED",
    "SEC",
    "EPS",
    "TOP",
    "NEW",
    "FOR",
    "AND",
    "THE",
  ]);

  for (const match of tickerMatches) {
    if (!skipWords.has(match) && match.length >= 2) {
      symbols.add(match);
    }
  }

  return [...symbols];
}

function buildEarningsScenarios(
  symbol: string,
  companyName: string | undefined,
  article: Pick<NewsArticle, "title" | "category" | "impact">
): StockImpactAnalysis {
  const label = companyName ? `${symbol} (${companyName})` : symbol;
  return withChances(
    {
      symbol,
      companyName,
      relationship: "direct",
      confidence: "High",
      ifPositive: `If ${label} beats EPS/revenue estimates or raises guidance, the stock could rally as investors reward strong fundamentals.`,
      ifNegative: `If ${label} misses estimates, cuts guidance, or warns on demand, the stock could drop on disappointment and multiple compression.`,
    },
    article,
    "earnings"
  );
}

function buildMergerScenarios(
  symbol: string,
  companyName: string | undefined,
  role: "target" | "acquirer",
  article: Pick<NewsArticle, "title" | "category" | "impact">
): StockImpactAnalysis {
  const label = companyName ? `${symbol} (${companyName})` : symbol;

  if (role === "target") {
    return withChances(
      {
        symbol,
        companyName,
        relationship: "direct",
        confidence: "High",
        ifPositive: `If a deal is announced or approved at a premium, ${label} could spike toward the offer price.`,
        ifNegative: `If the deal falls through or regulators block it, ${label} could fall back as the takeover premium disappears.`,
      },
      article,
      "merger_target"
    );
  }

  return withChances(
    {
      symbol,
      companyName,
      relationship: "direct",
      confidence: "Medium",
      ifPositive: `If the market likes the strategic fit and synergy targets, ${label} could rise on long-term growth expectations.`,
      ifNegative: `If investors fear overpayment, integration risk, or regulatory pushback, ${label} could decline after the announcement.`,
    },
    article,
    "merger_acquirer"
  );
}

function buildMacroScenarios(
  symbol: string,
  article: Pick<NewsArticle, "title" | "category" | "impact">
): StockImpactAnalysis {
  const isIndex = ["SPY", "QQQ", "DIA"].includes(symbol);

  return withChances(
    {
      symbol,
      relationship: isIndex ? "market-wide" : "sector",
      confidence: isIndex ? "High" : "Medium",
      ifPositive: `If the news signals lower rates, softer inflation, or stronger growth, ${symbol} could benefit as risk appetite improves.`,
      ifNegative: `If the news points to higher rates, sticky inflation, or slowing growth, ${symbol} could fall as investors price in tighter conditions.`,
    },
    article,
    "macro"
  );
}

function buildUpgradeDowngradeScenarios(
  symbol: string,
  companyName: string | undefined,
  article: Pick<NewsArticle, "title" | "category" | "impact">
): StockImpactAnalysis {
  const label = companyName ? `${symbol} (${companyName})` : symbol;
  return withChances(
    {
      symbol,
      companyName,
      relationship: "direct",
      confidence: "Medium",
      ifPositive: `If analysts upgrade ${label} or raise price targets, the stock could get a short-term boost from renewed buyer interest.`,
      ifNegative: `If analysts downgrade ${label} or cut targets, the stock could slip as institutional sentiment turns cautious.`,
    },
    article,
    "analyst"
  );
}

function buildGeneralScenarios(
  symbol: string,
  companyName: string | undefined,
  article: Pick<NewsArticle, "title" | "category" | "impact">
): StockImpactAnalysis {
  const label = companyName ? `${symbol} (${companyName})` : symbol;

  if (article.category === "investments") {
    return withChances(
      {
        symbol,
        companyName,
        relationship: "direct",
        confidence: "Medium",
        ifPositive: `If investors react well to the funding, growth story, or capital influx, ${label} could rise on higher confidence in future earnings.`,
        ifNegative: `If the market questions valuation, dilution, or execution risk, ${label} could fall despite positive headlines.`,
      },
      article,
      "general"
    );
  }

  if (article.category === "markets") {
    return withChances(
      {
        symbol,
        companyName,
        relationship: symbol.length <= 4 ? "direct" : "market-wide",
        confidence: "Medium",
        ifPositive: `If broader market sentiment stays bullish, ${label} could move up alongside improving risk appetite.`,
        ifNegative: `If fear dominates or volatility spikes, ${label} could decline with the wider market.`,
      },
      article,
      "general"
    );
  }

  return withChances(
    {
      symbol,
      companyName,
      relationship: "direct",
      confidence: "Low",
      ifPositive: `If follow-up reporting confirms a positive outcome for ${label}, the stock could drift higher on relief.`,
      ifNegative: `If later details disappoint or uncertainty rises, ${label} could give back gains or slide further.`,
    },
    article,
    "general"
  );
}

function inferMergerRole(
  title: string,
  symbol: string
): "target" | "acquirer" {
  const lower = title.toLowerCase();
  if (lower.includes("acquires") || lower.includes("buys") || lower.includes("to buy")) {
    return lower.indexOf(symbol.toLowerCase()) < lower.indexOf("acquires")
      ? "acquirer"
      : "target";
  }
  if (lower.includes("target") || lower.includes("takeover") || lower.includes("deal for")) {
    return "target";
  }
  return "target";
}

function titleSignalsAnalystAction(title: string): boolean {
  const lower = title.toLowerCase();
  return /upgrade|downgrade|price target|analyst|overweight|underweight|rating/.test(
    lower
  );
}

export function analyzeArticleImpacts(
  article: Pick<
    NewsArticle,
    "title" | "relatedTickers" | "category" | "impact"
  >
): StockImpactAnalysis[] {
  const titleSymbols = detectSymbolsFromTitle(article.title);
  const allSymbols = [
    ...new Set([...article.relatedTickers.map((s) => s.toUpperCase()), ...titleSymbols]),
  ];

  const impacts: StockImpactAnalysis[] = [];
  const seen = new Set<string>();

  function addImpact(impact: StockImpactAnalysis) {
    if (seen.has(impact.symbol)) return;
    seen.add(impact.symbol);
    impacts.push(impact);
  }

  for (const symbol of allSymbols) {
    const companyName = Object.entries(COMPANY_ALIASES).find(
      ([, value]) => value === symbol
    )?.[0];

    if (article.category === "earnings") {
      addImpact(buildEarningsScenarios(symbol, companyName, article));
    } else if (article.category === "mergers") {
      addImpact(
        buildMergerScenarios(
          symbol,
          companyName,
          inferMergerRole(article.title, symbol),
          article
        )
      );
    } else if (titleSignalsAnalystAction(article.title)) {
      addImpact(buildUpgradeDowngradeScenarios(symbol, companyName, article));
    } else if (article.category === "macro") {
      addImpact(buildMacroScenarios(symbol, article));
    } else {
      addImpact(buildGeneralScenarios(symbol, companyName, article));
    }
  }

  if (article.category === "macro") {
    for (const symbol of MACRO_SYMBOLS) {
      addImpact(buildMacroScenarios(symbol, article));
    }
    if (/fed|rate|inflation|bank|treasury|yield/.test(article.title.toLowerCase())) {
      for (const symbol of FINANCIAL_SYMBOLS) {
        addImpact(buildMacroScenarios(symbol, article));
      }
    }
    if (/oil|energy|opec|crude/.test(article.title.toLowerCase())) {
      for (const symbol of ENERGY_SYMBOLS) {
        addImpact(buildMacroScenarios(symbol, article));
      }
    }
  }

  if (article.category === "markets" && impacts.length === 0) {
    for (const symbol of MACRO_SYMBOLS) {
      addImpact(buildMacroScenarios(symbol, article));
    }
  }

  if (
    article.category === "markets" &&
    /tech|nasdaq|ai |chip|semiconductor/.test(article.title.toLowerCase())
  ) {
    for (const symbol of TECH_SYMBOLS.slice(0, 4)) {
      addImpact(buildGeneralScenarios(symbol, undefined, article));
    }
  }

  return impacts.slice(0, 6);
}

export function getAffectedSymbols(article: NewsArticle): string[] {
  const fromImpacts = article.stockImpacts.map((impact) => impact.symbol);
  return [...new Set([...article.relatedTickers, ...fromImpacts])];
}
