import { describe, expect, it } from "vitest";
import {
  ROBINHOOD_PATH,
  robinhoodAllowsDraft,
  robinhoodHowTo,
  robinhoodTicket,
  ticketFitsLevel,
} from "./robinhood-options";

describe("robinhoodTicket", () => {
  it("maps catalog names to Strategy builder tickets", () => {
    expect(robinhoodTicket("iron_condor")?.builderName).toBe("Iron condor");
    expect(robinhoodTicket("iron_condor")?.level).toBe(3);
    expect(robinhoodTicket("cash_secured_put")?.level).toBe(2);
    expect(robinhoodTicket("long_straddle")?.outlook).toBe("volatility");
    expect(robinhoodTicket("custom")).toBeNull();
  });

  it("writes the Trade → Trade options path", () => {
    expect(robinhoodHowTo("put_credit_spread")).toBe(
      `${ROBINHOOD_PATH} → Put credit spread`
    );
  });
});

describe("ticketFitsLevel", () => {
  it("keeps Level 2 to the four cash/IRA tickets", () => {
    expect(ticketFitsLevel("long_call", 2)).toBe(true);
    expect(ticketFitsLevel("cash_secured_put", 2)).toBe(true);
    expect(ticketFitsLevel("covered_call", 2)).toBe(true);
    expect(ticketFitsLevel("long_put", 2)).toBe(true);
    expect(ticketFitsLevel("iron_condor", 2)).toBe(false);
    expect(ticketFitsLevel("long_straddle", 2)).toBe(false);
    expect(ticketFitsLevel("call_credit_spread", 2)).toBe(false);
  });

  it("unlocks spreads and straddles at Level 3", () => {
    expect(ticketFitsLevel("iron_condor", 3)).toBe(true);
    expect(ticketFitsLevel("call_credit_spread", 3)).toBe(true);
    expect(ticketFitsLevel("put_debit_spread", 3)).toBe(true);
    expect(ticketFitsLevel("long_call", 3)).toBe(true);
  });
});

describe("robinhoodAllowsDraft", () => {
  it("rejects a naked short call", () => {
    const result = robinhoodAllowsDraft(
      [{ type: "call", strike: 100, side: "short" }],
      false
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/naked short call/i);
  });

  it("treats a lone short put as a cash-secured put", () => {
    const result = robinhoodAllowsDraft(
      [{ type: "put", strike: 95, side: "short" }],
      false
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toMatch(/cash-secured put/i);
  });

  it("rejects an uncovered short straddle", () => {
    const result = robinhoodAllowsDraft(
      [
        { type: "call", strike: 100, side: "short" },
        { type: "put", strike: 100, side: "short" },
      ],
      false
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/uncovered shorts/i);
  });

  it("allows a defined-risk vertical", () => {
    const result = robinhoodAllowsDraft(
      [
        { type: "put", strike: 95, side: "short" },
        { type: "put", strike: 90, side: "long" },
      ],
      true
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toMatch(/multi-leg/i);
  });
});
