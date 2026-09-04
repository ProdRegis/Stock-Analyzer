"use client";

import type { OpenOptionsHint } from "@/lib/types";

export default function OpenOptionsButton({
  symbol,
  onOpen,
  eventDate,
}: {
  symbol: string;
  onOpen: (symbol: string, hint?: OpenOptionsHint) => void;
  eventDate?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(symbol, eventDate ? { eventDate } : undefined);
      }}
      className="rounded-full border border-slate-700 px-2.5 py-1 text-xs font-medium text-violet-300 transition hover:border-violet-500/40 hover:text-violet-200"
    >
      Options
    </button>
  );
}
