"use client";

import { Bell, CalendarClock, Target } from "lucide-react";
import type { SellReminder, SellReminderUrgency } from "@/lib/sell-reminder";

const urgencyStyles: Record<
  SellReminderUrgency,
  { wrap: string; icon: string }
> = {
  hit: {
    wrap: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
    icon: "text-emerald-400",
  },
  due: {
    wrap: "border-amber-500/40 bg-amber-500/10 text-amber-100",
    icon: "text-amber-400",
  },
  approaching: {
    wrap: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    icon: "text-amber-400",
  },
  watching: {
    wrap: "border-slate-600 bg-slate-800/60 text-slate-200",
    icon: "text-slate-400",
  },
};

export default function SellReminderBanner({
  reminder,
  compact = false,
}: {
  reminder: SellReminder;
  compact?: boolean;
}) {
  const styles = urgencyStyles[reminder.urgency];
  const Icon =
    reminder.urgency === "hit"
      ? Target
      : reminder.dateDue || reminder.daysUntil != null
        ? CalendarClock
        : Bell;

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${styles.wrap}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${styles.icon}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{reminder.title}</p>
        {!compact && (
          <p className="mt-0.5 text-xs leading-relaxed opacity-80">
            {reminder.detail}
          </p>
        )}
      </div>
    </div>
  );
}
