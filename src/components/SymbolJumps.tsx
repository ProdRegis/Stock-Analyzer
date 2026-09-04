"use client";

import OpenOptionsButton from "./OpenOptionsButton";
import OpenThesisButton from "./OpenThesisButton";
import type { OpenOptionsHint } from "@/lib/types";

export default function SymbolJumps({
  symbol,
  onOpenThesis,
  onOpenOptions,
  eventDate,
}: {
  symbol: string;
  onOpenThesis?: (symbol: string) => void;
  onOpenOptions?: (symbol: string, hint?: OpenOptionsHint) => void;
  eventDate?: string;
}) {
  if (!onOpenThesis && !onOpenOptions) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {onOpenThesis && (
        <OpenThesisButton symbol={symbol} onOpen={onOpenThesis} />
      )}
      {onOpenOptions && (
        <OpenOptionsButton
          symbol={symbol}
          onOpen={onOpenOptions}
          eventDate={eventDate}
        />
      )}
    </span>
  );
}
