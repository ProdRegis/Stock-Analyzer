"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Newspaper } from "lucide-react";
import EmptyState from "./EmptyState";
import PriceChart from "./PriceChart";
import { useStockAnalysis } from "@/hooks/useStockAnalysis";
import type { NewsArticle, NewsFeed, StockImpactAnalysis, UpcomingMarketEvent } from "@/lib/types";
import { getAffectedSymbols } from "@/lib/news-impact";

interface RecentNewsProps {
  portfolioSymbols?: string[];
  active?: boolean;
}

const impactStyles = {
  High: "bg-red-500/10 text-red-300 border-red-500/30",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Low: "bg-slate-800 text-slate-400 border-slate-700/60",
};

const categoryLabels: Record<NewsArticle["category"], string> = {
  earnings: "Earnings",
  macro: "Macro",
  mergers: "M&A",
  markets: "Markets",
  investments: "Investments",
  general: "General",
};

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventDate(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventLabel(event: UpcomingMarketEvent) {
  if (event.type === "earnings") return "Earnings Report";
  if (event.type === "earnings_call") return "Earnings Call";
  return "Ex-Dividend Date";
}

function EventCard({ event }: { event: UpcomingMarketEvent }) {
  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{event.symbol}</span>
            <span className="rounded-md bg-violet-500/5 px-2 py-0.5 text-xs text-violet-300">
              {eventLabel(event)}
            </span>
          </div>
          <p className="text-sm text-slate-500">{event.name}</p>
        </div>
        <p className="text-sm font-medium text-violet-300">
          {formatEventDate(event.date)}
        </p>
      </div>
      {event.earningsEstimate?.avg != null && (
        <p className="mt-2 text-xs text-slate-500">
          EPS estimate: ${event.earningsEstimate.avg.toFixed(2)}
          {event.earningsEstimate.low != null &&
            event.earningsEstimate.high != null &&
            ` (range $${event.earningsEstimate.low.toFixed(2)}–$${event.earningsEstimate.high.toFixed(2)})`}
        </p>
      )}
    </div>
  );
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSharpe(value: number) {
  return value.toFixed(2);
}

function StockImpactCard({ impact }: { impact: StockImpactAnalysis }) {
  const { analysis, loading, error } = useStockAnalysis(impact.symbol);
  const [showChart, setShowChart] = useState(false);

  const relationshipLabels = {
    direct: "Direct",
    sector: "Sector",
    "market-wide": "Market-wide",
  };

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold text-white">{impact.symbol}</span>
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
          {relationshipLabels[impact.relationship]}
        </span>
        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
          {impact.confidence} confidence
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-slate-900/50 px-3 py-2">
          <p className="text-xs text-slate-500">Volatility (ann.)</p>
          {loading ? (
            <p className="text-slate-400">Loading...</p>
          ) : analysis ? (
            <p className="font-medium text-white">
              {formatPercent(analysis.risk.annualizedVolatility)}
            </p>
          ) : (
            <p className="text-slate-500">—</p>
          )}
        </div>
        <div className="rounded-lg bg-slate-900/50 px-3 py-2">
          <p className="text-xs text-slate-500">Sharpe (ann. √252)</p>
          {loading ? (
            <p className="text-slate-400">Loading...</p>
          ) : analysis ? (
            <p
              className={`font-medium ${
                analysis.risk.sharpeRatio >= 0 ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {formatSharpe(analysis.risk.sharpeRatio)}
            </p>
          ) : (
            <p className="text-slate-500">—</p>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-3 text-xs text-amber-400">
          Could not load risk metrics for {impact.symbol}.
        </p>
      )}

      {analysis && (
        <button
          type="button"
          onClick={() => setShowChart((value) => !value)}
          className="mb-3 rounded-lg border border-slate-600 bg-slate-900/50 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
        >
          {showChart ? "Hide chart" : "View price chart"}
        </button>
      )}

      {showChart && analysis && (
        <div className="mb-3">
          <PriceChart
            history={analysis.history}
            resistanceLevels={analysis.resistanceLevels}
            symbol={analysis.symbol}
            heightClassName="h-48"
          />
        </div>
      )}

      <div className="space-y-2 text-sm">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
              If reporting goes well ↑
            </p>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
              {impact.positiveChance}% chance
            </span>
          </div>
          <p className="leading-relaxed text-slate-400">{impact.ifPositive}</p>
        </div>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">
              If reporting goes poorly ↓
            </p>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300">
              {impact.negativeChance}% chance
            </span>
          </div>
          <p className="leading-relaxed text-slate-400">{impact.ifNegative}</p>
        </div>
        <div className="rounded-lg border border-slate-600 bg-slate-900/50 px-3 py-2">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            How this chance was calculated
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            {impact.chanceCalculation}
          </p>
        </div>
      </div>
    </div>
  );
}

function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <article className="surface-2 rounded-2xl p-4 transition hover:border-slate-500/50">
      <div className="flex gap-4">
        {article.thumbnail && (
          <img
            src={article.thumbnail}
            alt=""
            className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${impactStyles[article.impact]}`}
            >
              {article.impact} Impact
            </span>
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-500">
              {categoryLabels[article.category]}
            </span>
            <span className="text-xs text-slate-500">
              {formatTimestamp(article.publishedAt)}
            </span>
          </div>

          <h3 className="text-base font-semibold leading-snug text-white">
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-blue-300"
            >
              {article.title}
            </a>
          </h3>

          <p className="mt-1 text-sm text-slate-500">{article.publisher}</p>

          {article.stockImpacts.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-sm font-medium text-slate-400">
                Stocks That Could Be Affected
              </h4>
              <div className="grid gap-3 lg:grid-cols-2">
                {article.stockImpacts.map((impact) => (
                  <StockImpactCard key={impact.symbol} impact={impact} />
                ))}
              </div>
            </div>
          )}

          {article.relatedTickers.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {article.relatedTickers.slice(0, 6).map((ticker) => (
                <span
                  key={ticker}
                  className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300"
                >
                  {ticker}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function RecentNews({
  portfolioSymbols = [],
  active = true,
}: RecentNewsProps) {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impactFilter, setImpactFilter] = useState<"all" | NewsArticle["impact"]>(
    "all"
  );
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | NewsArticle["category"]
  >("all");
  const [portfolioOnly, setPortfolioOnly] = useState(false);

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const symbols = portfolioSymbols.join(",");
      const url = symbols
        ? `/api/news?symbols=${encodeURIComponent(symbols)}`
        : "/api/news";

      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load news");
      }

      setFeed(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load news");
      setFeed(null);
    } finally {
      setLoading(false);
    }
  }, [portfolioSymbols]);

  // One timer drives the first fetch and the refresh cycle. Deferring the
  // initial call keeps the loading flag out of the commit that schedules it.
  // The tab stays mounted after the first visit, so skip the timers while hidden.
  useEffect(() => {
    if (!active) return;

    const initial = window.setTimeout(loadNews, 0);
    const interval = window.setInterval(loadNews, 5 * 60_000);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadNews, active]);

  const filteredArticles = useMemo(() => {
    if (!feed) return [];

    return feed.articles.filter((article) => {
      if (impactFilter !== "all" && article.impact !== impactFilter) {
        return false;
      }
      if (categoryFilter !== "all" && article.category !== categoryFilter) {
        return false;
      }
      if (portfolioOnly && portfolioSymbols.length > 0) {
        return getAffectedSymbols(article).some((ticker) =>
          portfolioSymbols.includes(ticker.toUpperCase())
        );
      }
      return true;
    });
  }, [feed, impactFilter, categoryFilter, portfolioOnly, portfolioSymbols]);

  const highImpactCount =
    feed?.articles.filter((article) => article.impact === "High").length ?? 0;

  return (
    <div className="space-y-6">
      <section className="surface-2 rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">News &amp; Events</h2>
            <p className="mt-1 text-sm text-slate-500">
              Headlines and upcoming events that could move major stocks and
              investments, with scenario analysis for affected tickers.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadNews}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-black transition hover:bg-blue-500 disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh News"}
            </button>
          </div>
        </div>

        {feed && (
          <p className="mt-3 text-xs text-slate-500">
            Updated {formatTimestamp(feed.fetchedAt)} · {feed.articles.length}{" "}
            articles · {highImpactCount} high-impact ·{" "}
            {feed.upcomingEvents.length} upcoming events
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", "High", "Medium", "Low"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setImpactFilter(option)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                impactFilter === option
                  ? "bg-blue-600 text-black"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700"
              }`}
            >
              {option === "all" ? "All Impact" : `${option} Impact`}
            </button>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              "all",
              "earnings",
              "macro",
              "mergers",
              "markets",
              "investments",
            ] as const
          ).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCategoryFilter(option)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                categoryFilter === option
                  ? "bg-slate-200 text-white"
                  : "bg-slate-800 text-slate-500 hover:bg-slate-700"
              }`}
            >
              {option === "all" ? "All Categories" : categoryLabels[option]}
            </button>
          ))}
        </div>

        {portfolioSymbols.length > 0 && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={portfolioOnly}
              onChange={(event) => setPortfolioOnly(event.target.checked)}
              className="rounded border-slate-600 bg-slate-800"
            />
            Only show news related to my portfolio (
            {portfolioSymbols.join(", ")})
          </label>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Stock impact scenarios are educational estimates based on the headline
          and category — not financial advice or price predictions. Probabilities
          use category baselines, headline tone, and exposure type — not live
          market odds.
        </p>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !feed && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-8 text-center text-slate-500">
          Loading market news and upcoming events...
        </div>
      )}

      {feed && feed.upcomingEvents.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold text-white">
            Upcoming Events (Next 30 Days)
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {feed.upcomingEvents.slice(0, 12).map((event) => (
              <EventCard
                key={`${event.symbol}-${event.type}-${event.date}`}
                event={event}
              />
            ))}
          </div>
        </section>
      )}

      {feed && (
        <section>
          <h3 className="mb-3 text-lg font-semibold text-white">
            Recent Headlines ({filteredArticles.length})
          </h3>

          {filteredArticles.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title="No matching headlines"
              description="Nothing matches the current filters. Try broadening them or refreshing to pull the latest stories."
            />
          ) : (
            <div className="space-y-3">
              {filteredArticles.map((article) => (
                <NewsCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
