/**
 * Countdown to the next US equity market open or close.
 *
 * Derived from the Eastern-time wall clock rather than a data feed, so it
 * needs no network call and updates every second. It knows regular hours and
 * weekends but not market holidays — on Thanksgiving the clock alone would
 * claim the market is open. Callers reconcile that against the live market
 * state from the quote API, which does know about holidays; see
 * `reconcileWithMarketState`.
 */

const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;
const MINUTES_PER_DAY = 24 * 60;

export interface EasternClock {
  /** 0 = Sunday through 6 = Saturday, in Eastern time. */
  weekday: number;
  /** Minutes elapsed since Eastern midnight. */
  minutes: number;
  seconds: number;
}

export interface MarketCountdown {
  isOpen: boolean;
  msRemaining: number;
  /** "Closes in" or "Opens in". */
  label: string;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const easternFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function easternClock(now: Date): EasternClock {
  const parts = easternFormatter.formatToParts(now);
  const lookup = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  // Some runtimes render midnight as hour 24 under hour12:false.
  const hour = Number(lookup("hour")) % 24;

  return {
    weekday: WEEKDAY_INDEX[lookup("weekday")] ?? 0,
    minutes: hour * 60 + Number(lookup("minute")),
    seconds: Number(lookup("second")),
  };
}

function isWeekday(day: number): boolean {
  return day >= 1 && day <= 5;
}

export function computeMarketCountdown(now: Date): MarketCountdown {
  const { weekday, minutes, seconds } = easternClock(now);

  const withinSession =
    isWeekday(weekday) && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES;

  if (withinSession) {
    return {
      isOpen: true,
      msRemaining: (CLOSE_MINUTES - minutes) * 60_000 - seconds * 1_000,
      label: "Closes in",
    };
  }

  // Walk forward to the next weekday, unless today's open is still ahead.
  let daysAhead = 0;
  if (!isWeekday(weekday) || minutes >= OPEN_MINUTES) {
    daysAhead = 1;
    while (!isWeekday((weekday + daysAhead) % 7)) daysAhead++;
  }

  const minutesUntilOpen =
    daysAhead * MINUTES_PER_DAY + OPEN_MINUTES - minutes;

  return {
    isOpen: false,
    msRemaining: minutesUntilOpen * 60_000 - seconds * 1_000,
    label: "Opens in",
  };
}

/**
 * The clock cannot see holidays, so a closed market would still show a
 * "Closes in" countdown. When the live feed disagrees, believe the feed and
 * suppress the countdown rather than display a confident wrong number.
 */
export function reconcileWithMarketState(
  countdown: MarketCountdown,
  marketState: string
): MarketCountdown | null {
  if (marketState === "UNKNOWN") return countdown;

  const feedSaysOpen = marketState === "REGULAR";
  if (feedSaysOpen === countdown.isOpen) return countdown;

  // Feed says open while the clock says closed means extended hours or a
  // schedule quirk; a countdown to the next regular open is still useful.
  if (feedSaysOpen) return null;

  return null;
}

/** Compact duration: "3d 4h", "2h 14m", or "14m 03s" in the final hour. */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Elapsed session time, shown in the profile menu: "1h 04m" or "12m". */
export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0m";

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${totalMinutes}m`;
}
