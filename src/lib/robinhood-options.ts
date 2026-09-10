/**
 * Robinhood Trade → Trade options tickets.
 *
 * The desk only recommends structures you can submit there. Uncovered shorts
 * are rejected at every approval level. Level 3 is margin-only. Names match
 * the Strategy builder (robinhood.com support articles, 2026).
 */

import type { DraftLeg } from "./options-builder";
import type { OptionStructureId } from "./types";

export type RobinhoodLevel = 2 | 3;
export type RobinhoodOutlook =
  | "bullish"
  | "bearish"
  | "volatility"
  | "neutral";

export interface RobinhoodTicket {
  id: OptionStructureId;
  builderName: string;
  level: RobinhoodLevel;
  outlook: RobinhoodOutlook;
  /** Extra collateral Robinhood requires besides the option premium. */
  needs: "none" | "shares" | "cash" | "margin";
  allowed: boolean;
}

export const ROBINHOOD_PATH =
  "Trade → Trade options → Strategy builder";

const TICKETS: Record<Exclude<OptionStructureId, "custom">, RobinhoodTicket> = {
  long_call: {
    id: "long_call",
    builderName: "Long call",
    level: 2,
    outlook: "bullish",
    needs: "none",
    allowed: true,
  },
  long_put: {
    id: "long_put",
    builderName: "Long put",
    level: 2,
    outlook: "bearish",
    needs: "none",
    allowed: true,
  },
  covered_call: {
    id: "covered_call",
    builderName: "Covered call",
    level: 2,
    outlook: "neutral",
    needs: "shares",
    allowed: true,
  },
  cash_secured_put: {
    id: "cash_secured_put",
    builderName: "Cash-secured put",
    level: 2,
    outlook: "bullish",
    needs: "cash",
    allowed: true,
  },
  long_straddle: {
    id: "long_straddle",
    builderName: "Long straddle",
    level: 3,
    outlook: "volatility",
    needs: "margin",
    allowed: true,
  },
  long_strangle: {
    id: "long_strangle",
    builderName: "Long strangle",
    level: 3,
    outlook: "volatility",
    needs: "margin",
    allowed: true,
  },
  call_debit_spread: {
    id: "call_debit_spread",
    builderName: "Call debit spread",
    level: 3,
    outlook: "bullish",
    needs: "margin",
    allowed: true,
  },
  put_debit_spread: {
    id: "put_debit_spread",
    builderName: "Put debit spread",
    level: 3,
    outlook: "bearish",
    needs: "margin",
    allowed: true,
  },
  call_credit_spread: {
    id: "call_credit_spread",
    builderName: "Call credit spread",
    level: 3,
    outlook: "neutral",
    needs: "margin",
    allowed: true,
  },
  put_credit_spread: {
    id: "put_credit_spread",
    builderName: "Put credit spread",
    level: 3,
    outlook: "neutral",
    needs: "margin",
    allowed: true,
  },
  iron_condor: {
    id: "iron_condor",
    builderName: "Iron condor",
    level: 3,
    outlook: "neutral",
    needs: "margin",
    allowed: true,
  },
};

export function robinhoodTicket(
  id: OptionStructureId
): RobinhoodTicket | null {
  if (id === "custom") return null;
  return TICKETS[id];
}

export function robinhoodHowTo(id: OptionStructureId): string | null {
  const ticket = robinhoodTicket(id);
  if (!ticket) return null;
  return `${ROBINHOOD_PATH} → ${ticket.builderName}`;
}

export function ticketFitsLevel(
  id: OptionStructureId,
  level: RobinhoodLevel
): boolean {
  const ticket = robinhoodTicket(id);
  if (!ticket || !ticket.allowed) return false;
  return ticket.level <= level;
}

/**
 * Robinhood will not accept uncovered shorts. A lone short call is never a
 * ticket unless it is a covered call against 100 shares. A lone short put is
 * the cash-secured put. Short straddles/strangles are uncovered.
 */
export function robinhoodAllowsDraft(
  draft: DraftLeg[],
  definedRisk: boolean
): { allowed: boolean; reason: string } {
  if (draft.length === 0) {
    return { allowed: true, reason: "" };
  }

  const shorts = draft.filter((leg) => leg.side === "short");
  const longs = draft.filter((leg) => leg.side === "long");

  if (shorts.length > 0 && !definedRisk) {
    const onlyShortCall =
      shorts.length === 1 &&
      shorts[0].type === "call" &&
      longs.length === 0;
    const onlyShortPut =
      shorts.length === 1 &&
      shorts[0].type === "put" &&
      longs.length === 0;
    if (onlyShortCall) {
      return {
        allowed: false,
        reason:
          "Robinhood will not take a naked short call. Use a Covered call (100 shares) or a Call credit spread (Level 3).",
      };
    }
    if (onlyShortPut) {
      return {
        allowed: true,
        reason:
          "This is a Cash-secured put on Robinhood (Level 2). You need cash for 100 shares at the strike.",
      };
    }
    return {
      allowed: false,
      reason:
        "Robinhood does not allow uncovered shorts. Add a long wing so the max loss is capped, or use Iron condor / a credit spread.",
    };
  }

  return {
    allowed: true,
    reason: "This can be sent as a Robinhood multi-leg order. Use a limit.",
  };
}
