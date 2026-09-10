"use client";

import type { StopLossReasonDetail } from "@/lib/types";

const stopReasonStyles: Record<
  StopLossReasonDetail["category"],
  { badge: string; border: string }
> = {
  calculation: {
    badge: "bg-blue-500/15 text-blue-300",
    border: "border-blue-500/20",
  },
  technical: {
    badge: "bg-cyan-500/15 text-cyan-300",
    border: "border-cyan-500/20",
  },
  historical: {
    badge: "bg-amber-500/15 text-amber-300",
    border: "border-amber-500/20",
  },
  selection: {
    badge: "bg-emerald-500/15 text-emerald-300",
    border: "border-emerald-500/20",
  },
};

const stopReasonCategoryLabels: Record<
  StopLossReasonDetail["category"],
  string
> = {
  calculation: "Calculation",
  technical: "Technical",
  historical: "Historical",
  selection: "Why this price",
};

export default function StopLossReasonList({
  reasons,
  winningMethod,
}: {
  reasons: StopLossReasonDetail[];
  winningMethod: string;
}) {
  if (reasons.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-red-400/90">
        Calculation breakdown — winning method: {winningMethod}
      </p>
      {reasons.map((reason) => {
        const styles = stopReasonStyles[reason.category];
        return (
          <div
            key={reason.id}
            className={`rounded-lg border ${styles.border} bg-slate-900/30 px-3 py-2`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles.badge}`}
              >
                {stopReasonCategoryLabels[reason.category]}
              </span>
              <span className="text-sm font-medium text-slate-200">
                {reason.title}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              {reason.detail}
            </p>
          </div>
        );
      })}
    </div>
  );
}
