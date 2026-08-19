"use client";

import { Bell } from "lucide-react";
import SellReminderBanner from "./SellReminderBanner";
import {
  compareReminderUrgency,
  evaluateSellReminder,
  hasSellTarget,
} from "@/lib/sell-reminder";
import type { PortfolioAnalysis, PortfolioHolding } from "@/lib/types";

export default function SellReminderList({
  analysis,
  holdings,
}: {
  analysis: PortfolioAnalysis;
  holdings: PortfolioHolding[];
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

  if (items.length === 0) {
    return (
      <p className="mb-4 text-sm text-slate-500">
        Set a sell price or a sell-by date on a holding to get a reminder
        when it is time to take profit. That is separate from a safety stop,
        which is the price that cuts a loss.
      </p>
    );
  }

  const actionable = items.filter(
    (item) =>
      item.reminder.urgency === "hit" || item.reminder.urgency === "due"
  ).length;

  return (
    <section className="mb-4 space-y-2">
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
    </section>
  );
}
