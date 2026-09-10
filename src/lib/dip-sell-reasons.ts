import { yahooFinance } from "./yahoo-client";
import type {
  BuyTimingWindow,
  PastDipRecovery,
  ResistanceLevel,
  SellReasonDetail,
  SymbolHeadline,
  SymbolMarketContext,
  SymbolUpcomingEvent,
  TradeDirection,
} from "./types";

const HIGH_IMPACT_KEYWORDS = [
  "earnings",
  "fed",
  "merger",
  "acquisition",
  "bankruptcy",
  "investigation",
  "lawsuit",
  "guidance",
  "surge",
  "plunge",
  "crash",
];

const MEDIUM_IMPACT_KEYWORDS = [
  "downgrade",
  "upgrade",
  "ceo",
  "dividend",
  "revenue",
  "forecast",
  "tariff",
];

function classifyHeadlineImpact(title: string): SymbolHeadline["impact"] {
  const lower = title.toLowerCase();
  if (HIGH_IMPACT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "High";
  }
  if (MEDIUM_IMPACT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "Medium";
  }
  return "Low";
}

function formatEventLabel(type: SymbolUpcomingEvent["type"]): string {
  if (type === "earnings") return "Earnings report";
  if (type === "earnings_call") return "Earnings call";
  return "Ex-dividend date";
}

export async function fetchSymbolMarketContext(
  symbol: string
): Promise<SymbolMarketContext> {
  const upper = symbol.toUpperCase();

  try {
    const [searchResult, summary] = await Promise.all([
      yahooFinance.search(upper, { quotesCount: 0, newsCount: 4 }),
      yahooFinance
        .quoteSummary(upper, { modules: ["calendarEvents"] })
        .catch(() => null),
    ]);

    const headlines: SymbolHeadline[] = (searchResult.news ?? [])
      .slice(0, 3)
      .map((item) => ({
        title: item.title?.trim() || "Untitled headline",
        impact: classifyHeadlineImpact(item.title ?? ""),
        publishedAt: item.providerPublishTime.toISOString(),
      }));

    const events: SymbolUpcomingEvent[] = [];
    const calendar = summary?.calendarEvents;
    const now = Date.now();
    const horizon = now + 21 * 24 * 60 * 60 * 1000;

    calendar?.earnings?.earningsDate?.forEach((date) => {
      const time = date.getTime();
      if (time >= now && time <= horizon) {
        events.push({
          type: "earnings",
          date: date.toISOString(),
          label: formatEventLabel("earnings"),
        });
      }
    });

    calendar?.earnings?.earningsCallDate?.forEach((date) => {
      const time = date.getTime();
      if (time >= now && time <= horizon) {
        events.push({
          type: "earnings_call",
          date: date.toISOString(),
          label: formatEventLabel("earnings_call"),
        });
      }
    });

    if (calendar?.exDividendDate) {
      const time = calendar.exDividendDate.getTime();
      if (time >= now && time <= horizon) {
        events.push({
          type: "dividend",
          date: calendar.exDividendDate.toISOString(),
          label: formatEventLabel("dividend"),
        });
      }
    }

    return {
      headlines,
      events: events.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      ),
    };
  } catch {
    return { headlines: [], events: [] };
  }
}

interface LongSellReasonInput {
  direction: TradeDirection;
  currentPrice: number;
  rsi: number;
  buyTiming: BuyTimingWindow;
  buyDays: number;
  holdDays: number;
  sellDaysFromToday: number;
  sellTargetPrice: number;
  gainPct: number;
  sellDateLabel: string;
  nearestResistance: ResistanceLevel | null;
  nearestSupport: ResistanceLevel | null;
  avgRecoveryDays: number;
  historicalRecoveryRate: number;
  pastDips: PastDipRecovery[];
  context: SymbolMarketContext;
}

interface ShortSellReasonInput {
  direction: TradeDirection;
  rsi: number;
  coverDays: number;
  coverDateLabel: string;
  coverPrice: number | null;
  nearestSupport: ResistanceLevel | null;
  nearestResistance: ResistanceLevel | null;
  dipPercent: number;
  belowSupport: boolean;
  context: SymbolMarketContext;
}

function truncateHeadline(title: string, maxLength = 48): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 1).trim()}…`;
}

function headlineSentiment(title: string): "positive" | "negative" | "neutral" {
  const lower = title.toLowerCase();
  if (/surge|rally|beats|upgrade|record high|soars|jumps/.test(lower)) {
    return "positive";
  }
  if (/plunge|miss|downgrade|crash|lawsuit|investigation|cut guidance|falls/.test(lower)) {
    return "negative";
  }
  return "neutral";
}

export function buildLongSellReasons(input: LongSellReasonInput): SellReasonDetail[] {
  const reasons: SellReasonDetail[] = [];
  const positiveDips = input.pastDips.filter((dip) => dip.gain10d > 0);

  reasons.push({
    id: "calc-target",
    category: "calculation",
    title: "Price target math",
    detail: `Exit target $${input.sellTargetPrice.toFixed(2)} = ${input.nearestResistance ? `resistance $${input.nearestResistance.price.toFixed(2)} capped against` : ""} historical avg bounce of ${input.gainPct.toFixed(1)}% from current $${input.currentPrice.toFixed(2)}. Hold ~${input.holdDays} trading days after a ${input.buyDays}-day entry window → sell by ${input.sellDateLabel}.`,
  });

  reasons.push({
    id: "technical-rsi",
    category: "technical",
    title: "RSI & resistance",
    detail: `RSI is ${input.rsi.toFixed(0)}${input.rsi >= 60 ? " — approaching overbought where dip bounces often stall" : input.rsi <= 35 ? " — still oversold, but take profit once RSI crosses 65+" : ""}.${input.nearestResistance ? ` Resistance at $${input.nearestResistance.price.toFixed(2)} (${input.nearestResistance.touches} touches, strength ${input.nearestResistance.strength}) is the natural ceiling.` : " No strong resistance detected — use the calculated gain target instead."}${input.nearestSupport ? ` Stop-reference support remains at $${input.nearestSupport.price.toFixed(2)}.` : ""}`,
  });

  reasons.push({
    id: "prediction-history",
    category: "prediction",
    title: "Historical recovery pattern",
    detail: `${(input.historicalRecoveryRate * 100).toFixed(0)}% of ${input.pastDips.length} past dips on this stock recovered within ~${input.avgRecoveryDays.toFixed(0)} days.${positiveDips.length > 0 ? ` Average 10-day gain after dip: ${((positiveDips.reduce((sum, dip) => sum + dip.gain10d, 0) / positiveDips.length) * 100).toFixed(1)}%.` : ""} Selling into that window captures mean-reversion before the next pullback.`,
  });

  input.context.headlines.forEach((headline, index) => {
    const sentiment = headlineSentiment(headline.title);
    const published = new Date(headline.publishedAt).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    const title = `${headline.impact} impact — ${truncateHeadline(headline.title)} (${published})`;

    if (sentiment === "positive") {
      reasons.push({
        id: `news-${headline.publishedAt}-${index}`,
        category: "news",
        title,
        detail: `"${headline.title}" — positive news can extend a bounce. Consider selling into this strength near your target rather than holding for more upside.`,
      });
    } else if (sentiment === "negative") {
      reasons.push({
        id: `news-${headline.publishedAt}-${index}`,
        category: "news",
        title,
        detail: `"${headline.title}" — negative sentiment may cap recovery. If price reaches your target before this news fully prices in, take profits early.`,
      });
    } else {
      reasons.push({
        id: `news-${headline.publishedAt}-${index}`,
        category: "news",
        title,
        detail: `"${headline.title}" — monitor this story; unexpected developments near your exit date could accelerate or reverse the trade.`,
      });
    }
  });

  input.context.events.forEach((event, index) => {
    const eventDate = new Date(event.date).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const daysUntil = Math.ceil(
      (new Date(event.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );

    if (event.type === "earnings" || event.type === "earnings_call") {
      reasons.push({
        id: `event-${event.type}-${event.date}-${index}`,
        category: "event",
        title: `${event.label} in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
        detail: `${event.label} on ${eventDate} — earnings volatility can erase dip gains quickly. Many traders sell before the report unless holding through earnings intentionally.`,
      });
    } else {
      reasons.push({
        id: `event-${event.type}-${event.date}-${index}`,
        category: "event",
        title: `${event.label} on ${eventDate}`,
        detail: `Ex-dividend date approaching — price often adjusts on ex-date. Consider exiting before ${eventDate} if your target is already hit.`,
      });
    }
  });

  if (input.context.headlines.length === 0 && input.context.events.length === 0) {
    reasons.push({
      id: "news-none",
      category: "news",
      title: "No major headlines or events detected",
      detail:
        "No high-impact news or calendar events found in the next 3 weeks — rely on the technical target and historical recovery window for your exit.",
    });
  }

  return reasons;
}

export function buildShortSellReasons(input: ShortSellReasonInput): SellReasonDetail[] {
  const reasons: SellReasonDetail[] = [];

  reasons.push({
    id: "calc-cover",
    category: "calculation",
    title: "Cover price & timing",
    detail: input.coverPrice
      ? `Cover target $${input.coverPrice.toFixed(2)} at support floor. Estimated ${input.coverDays} trading days from today → cover by ${input.coverDateLabel}.`
      : `No clear support floor — cover when RSI drops below 35, estimated ~${input.coverDays} days (${input.coverDateLabel}).`,
  });

  reasons.push({
    id: "technical-breakdown",
    category: "technical",
    title: "Breakdown / overextension signals",
    detail: input.belowSupport
      ? `Price broke below support${input.nearestSupport ? ` at $${input.nearestSupport.price.toFixed(2)}` : ""} with RSI ${input.rsi.toFixed(0)} — cover before an oversold bounce.${input.nearestResistance ? ` Failed bounces near $${input.nearestResistance.price.toFixed(2)} resistance confirm the short.` : ""}`
      : `Stock is ${input.dipPercent.toFixed(1)}% extended above its long-term average with RSI ${input.rsi.toFixed(0)} — cover once the pullback reaches support to lock in gains.`,
  });

  reasons.push({
    id: "prediction-followthrough",
    category: "prediction",
    title: "Downside follow-through estimate",
    detail: `Short window assumes ${input.coverDays} days for the move to play out. Covering too late risks a sharp reversal if buyers step in at support.`,
  });

  input.context.headlines.forEach((headline, index) => {
    const sentiment = headlineSentiment(headline.title);
    const published = new Date(headline.publishedAt).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
    const title = `${headline.impact} impact — ${truncateHeadline(headline.title)} (${published})`;

    if (sentiment === "negative") {
      reasons.push({
        id: `news-${headline.publishedAt}-${index}`,
        category: "news",
        title,
        detail: `"${headline.title}" — negative news supports the short thesis. Cover near support if the headline accelerates selling into your target zone.`,
      });
    } else if (sentiment === "positive") {
      reasons.push({
        id: `news-${headline.publishedAt}-${index}`,
        category: "news",
        title,
        detail: `"${headline.title}" — positive news could trigger a short squeeze. Cover early if this headline hits before your support target.`,
      });
    } else {
      reasons.push({
        id: `news-${headline.publishedAt}-${index}`,
        category: "news",
        title,
        detail: `"${headline.title}" — watch for directional follow-through from this story when deciding whether to cover on schedule.`,
      });
    }
  });

  input.context.events.forEach((event, index) => {
    const eventDate = new Date(event.date).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    reasons.push({
      id: `event-${event.type}-${event.date}-${index}`,
      category: "event",
      title: `${event.label} on ${eventDate}`,
      detail:
        event.type === "earnings" || event.type === "earnings_call"
          ? `${event.label} on ${eventDate} — earnings can cause violent reversals. Strongly consider covering before the report unless you want event risk.`
          : `Ex-dividend on ${eventDate} — may cause a one-day price adjustment; factor this into your cover timing.`,
    });
  });

  if (input.context.headlines.length === 0 && input.context.events.length === 0) {
    reasons.push({
      id: "news-none",
      category: "news",
      title: "No major headlines or events detected",
      detail:
        "No high-impact news or calendar events in the next 3 weeks — use the technical cover target and RSI oversold signal for exit timing.",
    });
  }

  return reasons;
}

export function formatDateLabel(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function buyTimingToDays(buyTiming: BuyTimingWindow): number {
  switch (buyTiming) {
    case "now":
      return 0;
    case "tomorrow":
      return 1;
    case "2-3_days":
      return 2;
    case "this_week":
      return 4;
    case "1-2_weeks":
      return 8;
    case "wait":
      return 5;
    default:
      return 3;
  }
}
