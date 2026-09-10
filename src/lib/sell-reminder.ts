/**
 * Take-profit reminders for holdings the user already owns.
 *
 * Stops on the Safety Stops tab are the "get out if this goes wrong" number.
 * These are the opposite: a price or a date the owner picked as the time to
 * take the gain. Both are optional; a reminder exists as soon as either is set.
 */

export interface SellTarget {
  targetPrice?: number;
  targetDate?: string;
}

export type SellReminderUrgency = "hit" | "due" | "approaching" | "watching";

export interface SellReminder {
  urgency: SellReminderUrgency;
  title: string;
  detail: string;
  priceHit: boolean;
  dateDue: boolean;
  daysUntil: number | null;
  percentBelowTarget: number | null;
}

/** Within this fraction of the target price counts as approaching. */
export const PRICE_NEAR_FRACTION = 0.05;

/** Within this many calendar days of the sell-by date counts as approaching. */
export const DATE_NEAR_DAYS = 7;

const MS_PER_DAY = 86_400_000;

export function sanitizeTargetPrice(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

export function sanitizeTargetDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return parseCalendarDate(value) ? value : undefined;
}

export function hasSellTarget(target: SellTarget): boolean {
  return (
    sanitizeTargetPrice(target.targetPrice) != null ||
    sanitizeTargetDate(target.targetDate) != null
  );
}

/** Local calendar date, not UTC, so a typed date does not shift with timezone. */
export function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function calendarDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatCalendarDate(value: string): string {
  const date = parseCalendarDate(value);
  if (!date) return value;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** At least this far above the live price so the target is not already being tested. */
export const SUGGEST_MIN_GAP = 0.01;
/** Ignore resistance farther than this — that is not a weekly take-profit. */
export const SUGGEST_WEEKLY_GAP = 0.08;
/** Fallback when there is no nearby shelf. */
export const SUGGEST_DEFAULT_BUFFER = 0.03;
/** Gaps above this use next Friday instead of this Friday. */
export const SUGGEST_NEAR_GAP = 0.04;

export interface SuggestedSellPlan {
  targetPrice: number;
  targetDate: string;
  dateLabel: string;
  summary: string;
  reason: string;
  source: "resistance" | "buffer";
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCalendarDays(date: Date, days: number): Date {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** This week's Friday, or the coming Friday when the weekend has started. */
export function upcomingFriday(now: Date): Date {
  const today = startOfLocalDay(now);
  const add = (5 - today.getDay() + 7) % 7;
  return addCalendarDays(today, add);
}

export function formatFridayLabel(date: Date, now: Date): string {
  const today = startOfLocalDay(now);
  const due = startOfLocalDay(date);
  const daysUntil = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);

  if (daysUntil === 0) return "today (Friday)";
  if (daysUntil > 0 && daysUntil <= 5) return "this Friday";
  if (daysUntil > 5 && daysUntil <= 12) return "next Friday";

  return due.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function roundTakeProfit(price: number, minPrice: number): number {
  const snap = (value: number, step: number) => Math.round(value / step) * step;
  const step = price >= 100 ? 1 : price >= 20 ? 0.5 : 0.05;
  let rounded = snap(price, step);

  if (rounded < minPrice) {
    rounded = Math.ceil(minPrice / step - 1e-9) * step;
  }

  return Number(rounded.toFixed(2));
}

function nearbyResistance(
  currentPrice: number,
  resistanceLevels: Array<{ price: number }>
): number | undefined {
  const min = currentPrice * (1 + SUGGEST_MIN_GAP);
  const max = currentPrice * (1 + SUGGEST_WEEKLY_GAP);

  const above = resistanceLevels
    .map((level) => level.price)
    .filter((price) => Number.isFinite(price) && price >= min && price <= max)
    .sort((a, b) => a - b);

  return above[0];
}

/**
 * Weekly take-profit: nearby resistance when there is one, otherwise about 3%
 * up, paired with this Friday or next Friday.
 */
export function suggestSellPlan(input: {
  currentPrice: number;
  resistanceLevels: Array<{ price: number }>;
  now?: Date;
}): SuggestedSellPlan | null {
  const current = input.currentPrice;
  if (!Number.isFinite(current) || current <= 0) return null;

  const now = input.now ?? new Date();
  const resistance = nearbyResistance(current, input.resistanceLevels);
  const raw = resistance ?? current * (1 + SUGGEST_DEFAULT_BUFFER);
  const minPrice = current * (1 + SUGGEST_MIN_GAP);
  const targetPrice = roundTakeProfit(raw, minPrice);
  if (!(targetPrice > current)) return null;

  const gap = (targetPrice - current) / current;
  const thisFriday = upcomingFriday(now);
  const targetDateObj =
    gap > SUGGEST_NEAR_GAP ? addCalendarDays(thisFriday, 7) : thisFriday;
  const targetDate = calendarDateString(targetDateObj);
  const dateLabel = formatFridayLabel(targetDateObj, now);
  const priceLabel = `$${
    Number.isInteger(targetPrice) ? targetPrice.toFixed(0) : targetPrice.toFixed(2)
  }`;
  const source = resistance != null ? "resistance" : "buffer";

  return {
    targetPrice,
    targetDate,
    dateLabel,
    summary: `Sell by ${dateLabel} · target ${priceLabel}`,
    reason:
      source === "resistance"
        ? "Nearest resistance above the live price."
        : "About 3% above the live price — no nearby resistance shelf.",
    source,
  };
}

/** Price half of `suggestSellPlan` — nearest weekly-horizon resistance, or ~3% up. */
export function suggestedTargetPrice(
  currentPrice: number,
  resistanceLevels: Array<{ price: number }>
): number | undefined {
  return suggestSellPlan({ currentPrice, resistanceLevels })?.targetPrice;
}

export function compactSellTargetLine(
  target: SellTarget,
  now: Date = new Date()
): string | null {
  const targetPrice = sanitizeTargetPrice(target.targetPrice);
  const targetDate = sanitizeTargetDate(target.targetDate);
  if (targetPrice == null && targetDate == null) return null;

  const parts: string[] = [];
  if (targetDate) {
    const due = parseCalendarDate(targetDate);
    parts.push(`Sell by ${due ? formatFridayLabel(due, now) : formatCalendarDate(targetDate)}`);
  }
  if (targetPrice != null) {
    const priceLabel = Number.isInteger(targetPrice)
      ? targetPrice.toFixed(0)
      : targetPrice.toFixed(2);
    parts.push(`target $${priceLabel}`);
  }
  return parts.join(" · ");
}

export function compareReminderUrgency(
  a: SellReminderUrgency,
  b: SellReminderUrgency
): number {
  const rank: Record<SellReminderUrgency, number> = {
    hit: 0,
    due: 1,
    approaching: 2,
    watching: 3,
  };
  return rank[a] - rank[b];
}

export function evaluateSellReminder(input: {
  currentPrice: number;
  target: SellTarget;
  now?: Date;
}): SellReminder | null {
  const targetPrice = sanitizeTargetPrice(input.target.targetPrice);
  const targetDate = sanitizeTargetDate(input.target.targetDate);
  if (targetPrice == null && targetDate == null) return null;

  const now = input.now ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let daysUntil: number | null = null;
  let dateDue = false;
  if (targetDate) {
    const due = parseCalendarDate(targetDate);
    if (due) {
      daysUntil = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
      dateDue = daysUntil <= 0;
    }
  }

  let percentBelowTarget: number | null = null;
  let priceHit = false;
  if (
    targetPrice != null &&
    Number.isFinite(input.currentPrice) &&
    input.currentPrice > 0
  ) {
    percentBelowTarget = ((targetPrice - input.currentPrice) / targetPrice) * 100;
    priceHit = input.currentPrice >= targetPrice;
  }

  const approachingPrice =
    percentBelowTarget != null &&
    !priceHit &&
    percentBelowTarget > 0 &&
    percentBelowTarget <= PRICE_NEAR_FRACTION * 100;
  const approachingDate =
    daysUntil != null && !dateDue && daysUntil <= DATE_NEAR_DAYS;

  let urgency: SellReminderUrgency = "watching";
  if (priceHit) urgency = "hit";
  else if (dateDue) urgency = "due";
  else if (approachingPrice || approachingDate) urgency = "approaching";

  return {
    urgency,
    title: reminderTitle({ priceHit, dateDue, daysUntil }),
    detail: reminderDetail({
      currentPrice: input.currentPrice,
      targetPrice,
      targetDate,
      priceHit,
      dateDue,
      daysUntil,
      percentBelowTarget,
    }),
    priceHit,
    dateDue,
    daysUntil,
    percentBelowTarget,
  };
}

function reminderTitle(input: {
  priceHit: boolean;
  dateDue: boolean;
  daysUntil: number | null;
}): string {
  if (input.priceHit && input.dateDue) {
    return "Sell now — price and date both hit";
  }
  if (input.priceHit) return "Sell now — price reached your target";
  if (input.dateDue) {
    return input.daysUntil === 0
      ? "Sell today — your date is here"
      : "Sell date has passed";
  }
  return "Sell reminder";
}

function reminderDetail(input: {
  currentPrice: number;
  targetPrice: number | undefined;
  targetDate: string | undefined;
  priceHit: boolean;
  dateDue: boolean;
  daysUntil: number | null;
  percentBelowTarget: number | null;
}): string {
  const parts: string[] = [];

  if (input.targetPrice != null) {
    const priceLabel = `$${input.targetPrice.toFixed(2)}`;
    if (input.priceHit) {
      parts.push(
        `Live price $${input.currentPrice.toFixed(2)} is at or above ${priceLabel}.`
      );
    } else if (input.percentBelowTarget != null) {
      parts.push(
        `${input.percentBelowTarget.toFixed(1)}% below ${priceLabel} (now $${input.currentPrice.toFixed(2)}).`
      );
    }
  }

  if (input.targetDate && input.daysUntil != null) {
    const dateLabel = formatCalendarDate(input.targetDate);
    if (input.daysUntil === 0) {
      parts.push(`Sell-by date is today (${dateLabel}).`);
    } else if (input.daysUntil < 0) {
      const overdue = Math.abs(input.daysUntil);
      parts.push(
        `Sell-by date was ${dateLabel} (${overdue} day${overdue === 1 ? "" : "s"} ago).`
      );
    } else {
      parts.push(
        `Sell by ${dateLabel} (${input.daysUntil} day${input.daysUntil === 1 ? "" : "s"} left).`
      );
    }
  }

  return parts.join(" ");
}
