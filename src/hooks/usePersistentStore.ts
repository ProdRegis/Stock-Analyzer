"use client";

import { useSyncExternalStore } from "react";
import type { PersistentStore } from "@/lib/persistent-store";

export function usePersistentStore<T>(store: PersistentStore<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );
}
