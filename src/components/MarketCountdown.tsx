"use client";

import { Clock } from "lucide-react";
import { useNow } from "@/hooks/useNow";
import {
  computeMarketCountdown,
  formatCountdown,
  reconcileWithMarketState,
} from "@/lib/market-hours";

interface MarketCountdownProps {
  /** Live state from the quote feed, which unlike the clock knows holidays. */
  marketState: string;
}

export default function MarketCountdown({ marketState }: MarketCountdownProps) {
  const now = useNow();

  // 0 until hydration; rendering nothing avoids a server/client mismatch.
  if (now === 0) return null;

  const countdown = reconcileWithMarketState(
    computeMarketCountdown(new Date(now)),
    marketState
  );

  if (!countdown) return null;

  return (
    <span
      className="hidden items-center gap-1.5 text-xs font-medium text-slate-400 tabular-nums md:inline-flex"
      title={
        countdown.isOpen
          ? "Time until the regular session closes"
          : "Time until the regular session opens"
      }
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {countdown.label} {formatCountdown(countdown.msRemaining)}
    </span>
  );
}
