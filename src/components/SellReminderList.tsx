"use client";

import { Bell } from "lucide-react";
import SellReminderBanner from "./SellReminderBanner";
import {
  compareReminderUrgency,
  evaluateSellReminder,
  hasSellTarget,
  suggestSellPlan,
} from "@/lib/sell-reminder";
import type { PortfolioAnalysis, PortfolioHolding } from "@/lib/types";

export default function SellReminderList({
  analysis,
  holdings,
  onTargetChange,
}: {
  analysis: PortfolioAnalysis;
  holdings: PortfolioHolding[];
  onTargetChange?: (
    symbol: string,
    target: { targetPrice?: number; targetDate?: string }
  ) => void;
}) {
  const targetBySymbol = new Map(
    holdings.map((holding) => [
      holding.symbol.trim().toUpperCase(),
      holding,
    ])
  );

  const items = analysis.holdings
    .map((holding) => {
      const stored = targetBySymbol.get(holding.symbol);
      const target = {
        targetPrice: stored?.targetPrice,
        targetDate: stored?.targetDate,
      };
      if (!hasSellTarget(target)) return null;
      const reminder = evaluateSellReminder({
        currentPrice: holding.analysis.currentPrice,
        target,
      });
      if (!reminder) return null;
      return { symbol: holding.symbol, reminder };
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => compareReminderUrgency(a.reminder.urgency, b.reminder.urgency));

  const suggestions = analysis.holdings
    .map((holding) => {
      const stored = targetBySymbol.get(holding.symbol);
      const target = {
        targetPrice: stored?.targetPrice,
        targetDate: stored?.targetDate,
      };
      if (hasSellTarget(target)) return null;
      const plan = suggestSellPlan({
        currentPrice: holding.analysis.currentPrice,
        resistanceLevels: holding.analysis.resistanceLevels,
      });
      if (!plan) return null;
      return { symbol: holding.symbol, plan };
    })
    .filter((item): item is NonNullable<typeof item> => item != null);

  const actionable = items.filter(
    (item) =>
      item.reminder.urgency === "hit" || item.reminder.urgency === "due"
  ).length;

  if (items.length === 0 && suggestions.length === 0) {
    return (
      <p className="mb-4 text-sm text-slate-500">
        After you analyze, each holding gets a suggested take-profit — a sell-by
        Friday and a target price. You can use that plan or type your own. That
        is separate from a safety stop, which is the price that cuts a loss.
      </p>
    );
  }

  return (
    <section className="mb-4 space-y-4">
      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Bell className="h-4 w-4 text-slate-500" aria-hidden="true" />
              Sell reminders
            </h3>
            {actionable > 0 && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200">
                {actionable} ready to sell
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.symbol}>
                <div className="flex items-stretch gap-2">
                  <span className="flex w-16 shrink-0 items-center rounded-xl border border-slate-800 bg-slate-900/60 px-2 text-sm font-semibold text-white">
                    {item.symbol}
                  </span>
                  <div className="min-w-0 flex-1">
                    <SellReminderBanner reminder={item.reminder} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-300">
            Suggested take-profits
          </h3>
          <p className="text-xs text-slate-500">
            Nearby resistance when there is one, otherwise about 3% up. Dates
            are this Friday or next Friday. Not a stop-loss.
          </p>
          <ul className="space-y-2">
            {suggestions.map((item) => (
              <li
                key={item.symbol}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2"
              >
                <span className="w-16 shrink-0 text-sm font-semibold text-white">
                  {item.symbol}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200">{item.plan.summary}</p>
                  <p className="text-xs text-slate-500">{item.plan.reason}</p>
                </div>
                {onTargetChange && (
                  <button
                    type="button"
                    onClick={() =>
                      onTargetChange(item.symbol, {
                        targetPrice: item.plan.targetPrice,
                        targetDate: item.plan.targetDate,
                      })
                    }
                    className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800 hover:text-white"
                  >
                    Use this
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
