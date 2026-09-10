import { describe, expect, it } from "vitest";
import {
  computeMarketCountdown,
  easternClock,
  formatCountdown,
  formatElapsed,
  reconcileWithMarketState,
} from "./market-hours";

/** Builds a Date from an Eastern-time wall clock reading. */
function eastern(iso: string, offset: "-04:00" | "-05:00" = "-04:00"): Date {
  return new Date(`${iso}${offset}`);
}

describe("easternClock", () => {
  it("reads the Eastern weekday and minute-of-day", () => {
    // 2026-08-11 is a Tuesday.
    const clock = easternClock(eastern("2026-08-11T10:30:00"));
    expect(clock.weekday).toBe(2);
    expect(clock.minutes).toBe(10 * 60 + 30);
  });

  it("converts from other timezones rather than using local time", () => {
    // 17:30 UTC is 13:30 Eastern during daylight time.
    const clock = easternClock(new Date("2026-08-11T17:30:00Z"));
    expect(clock.minutes).toBe(13 * 60 + 30);
  });

  it("reports midnight as hour zero, not twenty-four", () => {
    expect(easternClock(eastern("2026-08-11T00:15:00")).minutes).toBe(15);
  });
});

describe("computeMarketCountdown", () => {
  it("counts down to the close during the session", () => {
    const countdown = computeMarketCountdown(eastern("2026-08-11T10:00:00"));
    expect(countdown.isOpen).toBe(true);
    expect(countdown.label).toBe("Closes in");
    expect(countdown.msRemaining).toBe(6 * 60 * 60_000);
  });

  it("counts down to today's open before the bell", () => {
    const countdown = computeMarketCountdown(eastern("2026-08-11T08:00:00"));
    expect(countdown.isOpen).toBe(false);
    expect(countdown.label).toBe("Opens in");
    expect(countdown.msRemaining).toBe(90 * 60_000);
  });

  it("treats the opening bell as open and the closing bell as closed", () => {
    expect(computeMarketCountdown(eastern("2026-08-11T09:30:00")).isOpen).toBe(
      true
    );
    expect(computeMarketCountdown(eastern("2026-08-11T16:00:00")).isOpen).toBe(
      false
    );
  });

  it("skips the weekend when counting from Friday evening", () => {
    // Friday 17:00 to Monday 09:30 is 64.5 hours.
    const countdown = computeMarketCountdown(eastern("2026-08-14T17:00:00"));
    expect(countdown.isOpen).toBe(false);
    expect(countdown.msRemaining).toBe(64.5 * 60 * 60_000);
  });

  it("skips the weekend when counting from Saturday", () => {
    // Saturday 10:00 to Monday 09:30 is 47.5 hours.
    const countdown = computeMarketCountdown(eastern("2026-08-15T10:00:00"));
    expect(countdown.msRemaining).toBe(47.5 * 60 * 60_000);
  });

  it("counts to Monday from Sunday", () => {
    const countdown = computeMarketCountdown(eastern("2026-08-16T09:30:00"));
    expect(countdown.msRemaining).toBe(24 * 60 * 60_000);
  });

  it("subtracts the current seconds so the display ticks smoothly", () => {
    const countdown = computeMarketCountdown(eastern("2026-08-11T15:59:30"));
    expect(countdown.msRemaining).toBe(30_000);
  });

  it("works during standard time as well as daylight time", () => {
    // 2026-01-13 is a Tuesday in EST.
    const countdown = computeMarketCountdown(
      eastern("2026-01-13T10:00:00", "-05:00")
    );
    expect(countdown.isOpen).toBe(true);
    expect(countdown.msRemaining).toBe(6 * 60 * 60_000);
  });
});

describe("reconcileWithMarketState", () => {
  const open = { isOpen: true, msRemaining: 1_000, label: "Closes in" };
  const closed = { isOpen: false, msRemaining: 1_000, label: "Opens in" };

  it("passes the countdown through when the feed agrees", () => {
    expect(reconcileWithMarketState(open, "REGULAR")).toBe(open);
    expect(reconcileWithMarketState(closed, "CLOSED")).toBe(closed);
  });

  it("trusts the clock when the feed has no opinion", () => {
    expect(reconcileWithMarketState(open, "UNKNOWN")).toBe(open);
  });

  it("hides the countdown on a holiday the clock cannot see", () => {
    // Clock says a weekday session is running; the feed knows better.
    expect(reconcileWithMarketState(open, "CLOSED")).toBeNull();
  });

  it("keeps counting to the open during extended hours", () => {
    // Pre-market is not the regular session, so the clock and feed agree the
    // regular session is closed and the countdown stays useful.
    expect(reconcileWithMarketState(closed, "PRE")).toBe(closed);
    expect(reconcileWithMarketState(closed, "POST")).toBe(closed);
  });
});

describe("formatCountdown", () => {
  it("shows seconds within the final hour", () => {
    expect(formatCountdown(14 * 60_000 + 3_000)).toBe("14m 03s");
  });

  it("shows hours and minutes beyond an hour", () => {
    expect(formatCountdown(2 * 3_600_000 + 14 * 60_000)).toBe("2h 14m");
  });

  it("shows days and hours for multi-day gaps", () => {
    expect(formatCountdown(3 * 86_400_000 + 4 * 3_600_000)).toBe("3d 4h");
  });

  it("clamps non-positive and invalid input", () => {
    expect(formatCountdown(0)).toBe("0m");
    expect(formatCountdown(-5_000)).toBe("0m");
    expect(formatCountdown(Number.NaN)).toBe("0m");
  });
});

describe("formatElapsed", () => {
  it("shows only minutes under an hour", () => {
    expect(formatElapsed(12 * 60_000)).toBe("12m");
  });

  it("pads minutes once hours appear", () => {
    expect(formatElapsed(3_600_000 + 4 * 60_000)).toBe("1h 04m");
  });

  it("floors partial minutes", () => {
    expect(formatElapsed(59_000)).toBe("0m");
  });
});
