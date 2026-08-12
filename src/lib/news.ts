import { NEWS_QUERIES, UPCOMING_EVENT_SYMBOLS } from "./news-constants";
import { analyzeArticleImpacts } from "./news-impact";
import { TTL, cached } from "./cache";
import { fetchQuote } from "./market-data";
import { yahooFinance } from "./yahoo-client";
import type { NewsArticle, NewsFeed, UpcomingMarketEvent } from "./types";

const HIGH_IMPACT_KEYWORDS = [
  "earnings",
  "fed",
  "federal reserve",
  "rate hike",
  "rate cut",
  "merger",
  "acquisition",
  "ipo",
  "bankruptcy",
  "sec ",
  "inflation",
  "recession",
  "tariff",
  "sanctions",
  "lawsuit",
  "investigation",
  "crash",
  "surge",
  "plunge",
  "record high",
  "record low",
  "guidance",
  "forecast",
];

const MEDIUM_IMPACT_KEYWORDS = [
  "investment",
  "revenue",
  "upgrade",
  "downgrade",
  "ceo",
  "dividend",
  "stock split",
  "buyback",
  "stimulus",
  "jobs report",
  "gdp",
  "oil prices",
  "bitcoin",
  "ai ",
];

function classifyCategory(title: string): NewsArticle["category"] {
  const lower = title.toLowerCase();

  if (/earnings|eps|quarterly results|guidance/.test(lower)) return "earnings";
  if (/merger|acquisition|takeover|buyout/.test(lower)) return "mergers";
  if (/fed|inflation|gdp|jobs|tariff|recession|interest rate/.test(lower)) {
    return "macro";
  }
  if (/investment|portfolio|fund|etf|ipo|venture/.test(lower)) {
    return "investments";
  }
  if (/stock market|s&p|nasdaq|dow|wall street|stocks/.test(lower)) {
    return "markets";
  }
  return "general";
}

function classifyImpact(title: string): NewsArticle["impact"] {
  const lower = title.toLowerCase();

  if (HIGH_IMPACT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "High";
  }
  if (MEDIUM_IMPACT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "Medium";
  }
  return "Low";
}

function normalizeArticle(
  item: {
    uuid: string;
    title: string;
    publisher: string;
    link: string;
    providerPublishTime: Date;
    relatedTickers?: string[];
    thumbnail?: { resolutions: Array<{ url: string }> };
  },
  sourceQuery: string
): NewsArticle {
  const title = item.title?.trim() || "Untitled";
  let category = classifyCategory(title);

  if (sourceQuery.includes("earnings")) category = "earnings";
  else if (sourceQuery.includes("merger")) category = "mergers";
  else if (sourceQuery.includes("Federal Reserve")) category = "macro";
  else if (sourceQuery.includes("investment") || sourceQuery.includes("IPO")) {
    category = "investments";
  } else if (sourceQuery.includes("stock market")) category = "markets";

  const relatedTickers = (item.relatedTickers ?? []).map((ticker) =>
    ticker.toUpperCase()
  );

  const base = {
    id: item.uuid,
    title,
    publisher: item.publisher,
    link: item.link,
    publishedAt: item.providerPublishTime.toISOString(),
    relatedTickers,
    category,
    impact: classifyImpact(title),
    thumbnail: item.thumbnail?.resolutions?.[0]?.url,
  };

  return {
    ...base,
    stockImpacts: analyzeArticleImpacts(base),
  };
}

async function fetchNewsForQuery(query: string): Promise<NewsArticle[]> {
  const result = await cached(`news:q:${query}`, TTL.news, () =>
    yahooFinance.search(query, {
      quotesCount: 0,
      newsCount: 12,
    })
  );

  return (result.news ?? []).map((item) =>
    normalizeArticle(
      item as {
        uuid: string;
        title: string;
        publisher: string;
        link: string;
        providerPublishTime: Date;
        relatedTickers?: string[];
        thumbnail?: { resolutions: Array<{ url: string }> };
      },
      query
    )
  );
}

async function fetchNewsForSymbol(symbol: string): Promise<NewsArticle[]> {
  const result = await cached(`news:s:${symbol}`, TTL.news, () =>
    yahooFinance.search(symbol, {
      quotesCount: 1,
      newsCount: 5,
    })
  );

  return (result.news ?? []).map((item) =>
    normalizeArticle(
      item as {
        uuid: string;
        title: string;
        publisher: string;
        link: string;
        providerPublishTime: Date;
        relatedTickers?: string[];
        thumbnail?: { resolutions: Array<{ url: string }> };
      },
      symbol
    )
  );
}

async function fetchUpcomingEvents(
  symbols: string[]
): Promise<UpcomingMarketEvent[]> {
  const events: UpcomingMarketEvent[] = [];
  const now = Date.now();
  const horizon = now + 30 * 24 * 60 * 60 * 1000;

  for (const symbol of symbols) {
    try {
      const [summary, quote] = await Promise.all([
        cached(`summary:${symbol}:calendar`, TTL.quoteSummary, () =>
          yahooFinance.quoteSummary(symbol, { modules: ["calendarEvents"] })
        ),
        fetchQuote(symbol),
      ]);

      const calendar = summary.calendarEvents;
      const name = quote.shortName ?? quote.longName ?? symbol;

      calendar?.earnings?.earningsDate?.forEach((date) => {
        const time = date.getTime();
        if (time >= now - 24 * 60 * 60 * 1000 && time <= horizon) {
          events.push({
            symbol,
            name,
            type: "earnings",
            date: date.toISOString(),
            earningsEstimate: {
              low: calendar.earnings.earningsLow,
              high: calendar.earnings.earningsHigh,
              avg: calendar.earnings.earningsAverage,
            },
          });
        }
      });

      calendar?.earnings?.earningsCallDate?.forEach((date) => {
        const time = date.getTime();
        if (time >= now - 24 * 60 * 60 * 1000 && time <= horizon) {
          events.push({
            symbol,
            name,
            type: "earnings_call",
            date: date.toISOString(),
          });
        }
      });

      if (calendar?.exDividendDate) {
        const time = calendar.exDividendDate.getTime();
        if (time >= now && time <= horizon) {
          events.push({
            symbol,
            name,
            type: "dividend",
            date: calendar.exDividendDate.toISOString(),
          });
        }
      }
    } catch {
      // Skip symbols that fail to load calendar data.
    }
  }

  return events.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

function dedupeArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.id || article.link;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortArticles(articles: NewsArticle[]): NewsArticle[] {
  const impactRank = { High: 0, Medium: 1, Low: 2 };

  return [...articles].sort((a, b) => {
    const impactDiff = impactRank[a.impact] - impactRank[b.impact];
    if (impactDiff !== 0) return impactDiff;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export async function fetchNewsFeed(extraSymbols: string[] = []): Promise<NewsFeed> {
  const symbolSet = new Set([
    ...UPCOMING_EVENT_SYMBOLS,
    ...extraSymbols.map((symbol) => symbol.toUpperCase()),
  ]);
  const symbols = [...symbolSet];

  const [queryNews, symbolNews, upcomingEvents] = await Promise.all([
    Promise.all(NEWS_QUERIES.map((query) => fetchNewsForQuery(query))),
    Promise.all(symbols.slice(0, 8).map((symbol) => fetchNewsForSymbol(symbol))),
    fetchUpcomingEvents(symbols.slice(0, 12)),
  ]);

  const articles = sortArticles(
    dedupeArticles([...queryNews.flat(), ...symbolNews.flat()])
  );

  return {
    fetchedAt: new Date().toISOString(),
    articles,
    upcomingEvents,
  };
}
