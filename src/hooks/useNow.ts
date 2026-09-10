"use client";

import { useSyncExternalStore } from "react";
import { secondClock, type ClockStore } from "@/lib/clock-store";

/** Current epoch milliseconds, re-rendering on each tick. 0 before hydration. */
export function useNow(store: ClockStore = secondClock): number {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
}
