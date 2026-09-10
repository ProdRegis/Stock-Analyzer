/**
 * A shared ticking clock for countdowns and elapsed timers.
 *
 * Exposed as an external store rather than an effect that calls setState on an
 * interval, matching how the rest of the app avoids writing state during
 * commit. The interval only runs while something is subscribed, and every
 * subscriber shares one timer instead of starting its own.
 *
 * getServerSnapshot returns 0 so the server and hydration renders agree;
 * components treat 0 as "not started yet" and render a placeholder.
 */

type Listener = () => void;

export interface ClockStore {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => number;
  getServerSnapshot: () => number;
}

export function createClockStore(intervalMs: number): ClockStore {
  let now = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<Listener>();

  function tick() {
    now = Date.now();
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);

      if (timer === null) {
        tick();
        timer = setInterval(tick, intervalMs);
      }

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },

    getSnapshot() {
      // First read happens before the first tick when nothing has subscribed.
      return now === 0 ? Date.now() : now;
    },

    getServerSnapshot() {
      return 0;
    },
  };
}

/** One-second cadence, for the market countdown's seconds display. */
export const secondClock = createClockStore(1_000);
