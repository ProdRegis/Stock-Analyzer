import { describe, expect, it } from "vitest";
import {
  calendarDateString,
  compactSellTargetLine,
  compareReminderUrgency,
  evaluateSellReminder,
  formatFridayLabel,
  hasSellTarget,
  parseCalendarDate,
  roundTakeProfit,
  sanitizeTargetDate,
  sanitizeTargetPrice,
  suggestSellPlan,
  suggestedTargetPrice,
  upcomingFriday,
} from "./sell-reminder";

const noon = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

describe("sanitizeTargetPrice", () => {
  it("keeps a positive finite price", () => {
    expect(sanitizeTargetPrice(210.5)).toBe(210.5);
  });

  it("drops zero, negative, and non-numbers", () => {
    expect(sanitizeTargetPrice(0)).toBeUndefined();
    expect(sanitizeTargetPrice(-1)).toBeUndefined();
    expect(sanitizeTargetPrice("210")).toBeUndefined();
    expect(sanitizeTargetPrice(Number.NaN)).toBeUndefined();
  });
});

describe("parseCalendarDate", () => {
  it("reads a local calendar date rather than UTC midnight", () => {
    const date = parseCalendarDate("2026-08-22");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(7);
    expect(date?.getDate()).toBe(22);
  });

  it("rejects impossible dates instead of rolling them over", () => {
    expect(parseCalendarDate("2026-02-31")).toBeNull();
    expect(parseCalendarDate("08/22/2026")).toBeNull();
  });

  it("round-trips through calendarDateString", () => {
    expect(calendarDateString(parseCalendarDate("2026-08-22")!)).toBe(
      "2026-08-22"
    );
  });
});

describe("hasSellTarget", () => {
  it("is true when either field is set", () => {
    expect(hasSellTarget({ targetPrice: 210 })).toBe(true);
    expect(hasSellTarget({ targetDate: "2026-08-22" })).toBe(true);
    expect(hasSellTarget({})).toBe(false);
    expect(hasSellTarget({ targetPrice: 0, targetDate: "nope" })).toBe(false);
  });
});

describe("evaluateSellReminder", () => {
  it("returns null when nothing is set", () => {
    expect(
      evaluateSellReminder({ currentPrice: 100, target: {} })
    ).toBeNull();
  });

  it("marks a price hit when live price reaches the target", () => {
    const reminder = evaluateSellReminder({
      currentPrice: 211,
      target: { targetPrice: 210 },
      now: noon("2026-08-18"),
    });

    expect(reminder?.urgency).toBe("hit");
    expect(reminder?.priceHit).toBe(true);
    expect(reminder?.title).toMatch(/price reached/i);
  });

  it("marks the date due on the sell-by day", () => {
    const reminder = evaluateSellReminder({
      currentPrice: 180,
      target: { targetDate: "2026-08-18" },
      now: noon("2026-08-18"),
    });

    expect(reminder?.urgency).toBe("due");
    expect(reminder?.dateDue).toBe(true);
    expect(reminder?.daysUntil).toBe(0);
    expect(reminder?.title).toMatch(/today/i);
  });

  it("treats a past sell-by date as due, not approaching", () => {
    const reminder = evaluateSellReminder({
      currentPrice: 180,
      target: { targetDate: "2026-08-10" },
      now: noon("2026-08-18"),
    });

    expect(reminder?.urgency).toBe("due");
    expect(reminder?.daysUntil).toBe(-8);
  });

  it("approaches when price is within 5% of the target", () => {
    const reminder = evaluateSellReminder({
      currentPrice: 96,
      target: { targetPrice: 100 },
      now: noon("2026-08-18"),
    });

    expect(reminder?.urgency).toBe("approaching");
    expect(reminder?.percentBelowTarget).toBeCloseTo(4, 5);
  });

  it("approaches when the sell-by date is within a week", () => {
    const reminder = evaluateSellReminder({
      currentPrice: 180,
      target: { targetDate: "2026-08-22" },
      now: noon("2026-08-18"),
    });

    expect(reminder?.urgency).toBe("approaching");
    expect(reminder?.daysUntil).toBe(4);
  });

  it("stays on watch when both targets are still far off", () => {
    const reminder = evaluateSellReminder({
      currentPrice: 80,
      target: { targetPrice: 100, targetDate: "2026-12-01" },
      now: noon("2026-08-18"),
    });

    expect(reminder?.urgency).toBe("watching");
    expect(reminder?.priceHit).toBe(false);
    expect(reminder?.dateDue).toBe(false);
  });

  it("prefers a price hit over a due date when both fire", () => {
    const reminder = evaluateSellReminder({
      currentPrice: 220,
      target: { targetPrice: 210, targetDate: "2026-08-10" },
      now: noon("2026-08-18"),
    });

    expect(reminder?.urgency).toBe("hit");
    expect(reminder?.priceHit).toBe(true);
    expect(reminder?.dateDue).toBe(true);
    expect(reminder?.title).toMatch(/price and date/i);
  });

  it("ignores a malformed date instead of throwing", () => {
    expect(sanitizeTargetDate("August 22")).toBeUndefined();
    expect(
      evaluateSellReminder({
        currentPrice: 100,
        target: { targetDate: "August 22" },
      })
    ).toBeNull();
  });
});

describe("suggestedTargetPrice", () => {
  it("picks the nearest resistance at least 1% and at most 8% above the live price", () => {
    expect(
      suggestedTargetPrice(100, [
        { price: 100.5 },
        { price: 112 },
        { price: 108 },
        { price: 90 },
      ])
    ).toBe(108);
  });

  it("falls back to about 3% up when every shelf is already being tested", () => {
    expect(suggestedTargetPrice(100, [{ price: 100.4 }, { price: 99 }])).toBe(
      103
    );
  });
});

describe("upcomingFriday", () => {
  it("returns this Friday from midweek", () => {
    expect(calendarDateString(upcomingFriday(noon("2026-08-19")))).toBe(
      "2026-08-21"
    );
  });

  it("returns today when it is already Friday", () => {
    expect(calendarDateString(upcomingFriday(noon("2026-08-21")))).toBe(
      "2026-08-21"
    );
  });

  it("skips to the next Friday on Saturday", () => {
    expect(calendarDateString(upcomingFriday(noon("2026-08-22")))).toBe(
      "2026-08-28"
    );
  });
});

describe("formatFridayLabel", () => {
  it("says this Friday, next Friday, or today", () => {
    const wednesday = noon("2026-08-19");
    expect(formatFridayLabel(noon("2026-08-21"), wednesday)).toBe("this Friday");
    expect(formatFridayLabel(noon("2026-08-28"), wednesday)).toBe("next Friday");
    expect(formatFridayLabel(noon("2026-08-21"), noon("2026-08-21"))).toBe(
      "today (Friday)"
    );
  });
});

describe("roundTakeProfit", () => {
  it("rounds a ~317 weekly target to a whole dollar", () => {
    expect(roundTakeProfit(317.03, 310)).toBe(317);
  });

  it("does not round below the live-price floor", () => {
    expect(roundTakeProfit(101.2, 101.4)).toBe(102);
  });
});

describe("suggestSellPlan", () => {
  it("pairs a nearby resistance with this Friday when the gap is small", () => {
    const plan = suggestSellPlan({
      currentPrice: 100,
      resistanceLevels: [{ price: 103 }],
      now: noon("2026-08-19"),
    });

    expect(plan).not.toBeNull();
    expect(plan!.targetPrice).toBe(103);
    expect(plan!.targetDate).toBe("2026-08-21");
    expect(plan!.dateLabel).toBe("this Friday");
    expect(plan!.summary).toBe("Sell by this Friday · target $103");
    expect(plan!.source).toBe("resistance");
  });

  it("uses next Friday when the target is farther than 4%", () => {
    const plan = suggestSellPlan({
      currentPrice: 100,
      resistanceLevels: [{ price: 108 }],
      now: noon("2026-08-19"),
    });

    expect(plan!.targetDate).toBe("2026-08-28");
    expect(plan!.dateLabel).toBe("next Friday");
    expect(plan!.summary).toBe("Sell by next Friday · target $108");
  });

  it("falls back to a 3% buffer when there is no nearby resistance", () => {
    const plan = suggestSellPlan({
      currentPrice: 307.8,
      resistanceLevels: [{ price: 250 }, { price: 400 }],
      now: noon("2026-08-19"),
    });

    expect(plan!.targetPrice).toBe(317);
    expect(plan!.source).toBe("buffer");
    expect(plan!.summary).toBe("Sell by this Friday · target $317");
  });
});

describe("compactSellTargetLine", () => {
  it("phrases a saved Friday target the same way as the suggestion", () => {
    expect(
      compactSellTargetLine(
        { targetPrice: 317, targetDate: "2026-08-21" },
        noon("2026-08-19")
      )
    ).toBe("Sell by this Friday · target $317");
  });
});

describe("compareReminderUrgency", () => {
  it("orders hit before due before approaching before watching", () => {
    expect(compareReminderUrgency("hit", "due")).toBeLessThan(0);
    expect(compareReminderUrgency("due", "approaching")).toBeLessThan(0);
    expect(compareReminderUrgency("approaching", "watching")).toBeLessThan(0);
  });
});
