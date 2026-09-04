import { describe, expect, it } from "vitest";
import {
  calendarDte,
  expiryOnOrAfter,
  isFrontWeek,
  normalizeYahooIv,
  pickDefaultExpiration,
  pickExpirationDates,
  windowStrikes,
} from "./options-desk";

describe("calendarDte", () => {
  it("counts whole UTC days remaining", () => {
    const now = new Date("2026-04-01T15:00:00.000Z");
    expect(calendarDte("2026-04-01", now)).toBe(0);
    expect(calendarDte("2026-04-17", now)).toBe(16);
  });
});

describe("normalizeYahooIv", () => {
  it("keeps decimals and scales percent-looking values", () => {
    expect(normalizeYahooIv(0.42)).toBeCloseTo(0.42, 10);
    expect(normalizeYahooIv(42)).toBeCloseTo(0.42, 10);
    expect(normalizeYahooIv(0)).toBeNull();
  });
});

describe("pickExpirationDates", () => {
  it("keeps the front week and a ~30-day expiry", () => {
    const now = new Date("2026-04-01T00:00:00.000Z");
    const dates = [4, 11, 18, 25, 32, 60, 90, 180].map(
      (dte) => new Date(Date.UTC(2026, 3, 1 + dte))
    );
    const picked = pickExpirationDates(dates, now);
    const dtes = picked.map((date) =>
      calendarDte(date.toISOString().slice(0, 10), now)
    );
    expect(dtes[0]).toBeLessThanOrEqual(11);
    expect(dtes.some((dte) => Math.abs(dte - 30) <= 8)).toBe(true);
    expect(picked.length).toBeGreaterThan(2);
    expect(picked.length).toBeLessThanOrEqual(7);
  });
});

describe("pickDefaultExpiration", () => {
  it("skips 0 DTE and lands near 30 DTE", () => {
    const rows = [0, 4, 11, 18, 25, 32, 60].map((dte) => ({
      iso: `d${dte}`,
      dte,
    }));
    expect(pickDefaultExpiration(rows)).toBe("d32");
  });

  it("falls back to the front if nothing is listed past a week", () => {
    expect(
      pickDefaultExpiration([
        { iso: "today", dte: 0 },
        { iso: "friday", dte: 4 },
      ])
    ).toBe("friday");
  });
});

describe("expiryOnOrAfter", () => {
  it("picks the first expiry that still contains the print", () => {
    expect(
      expiryOnOrAfter(
        [
          { expiration: "2026-04-10" },
          { expiration: "2026-04-17" },
          { expiration: "2026-05-15" },
        ],
        "2026-04-16"
      )
    ).toBe("2026-04-17");
  });
});

describe("isFrontWeek", () => {
  it("treats sub-7 DTE as front week", () => {
    expect(isFrontWeek(0)).toBe(true);
    expect(isFrontWeek(6)).toBe(true);
    expect(isFrontWeek(7)).toBe(false);
  });
});

describe("windowStrikes", () => {
  it("centers the window on the strike nearest spot", () => {
    const strikes = Array.from({ length: 80 }, (_, i) => 60 + i);
    const window = windowStrikes(strikes, 100, 11);
    expect(window).toHaveLength(11);
    expect(window[5]).toBe(100);
  });
});
