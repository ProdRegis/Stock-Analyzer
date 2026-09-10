"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * False during the server render and the hydration pass, true afterwards.
 *
 * Lets a component avoid committing to a branch that depends on localStorage
 * until that storage is actually readable, instead of rendering the wrong
 * branch first and visibly swapping. Uses the server/client snapshot split
 * rather than an effect, so it does not set state during commit.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
