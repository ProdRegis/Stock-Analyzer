type Listener = () => void;

export interface PersistentStore<T> {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  /** Replace the value and persist it. */
  set: (value: T) => void;
  /** Adopt a value that some other code path already persisted. */
  sync: (value: T) => void;
}

/**
 * Wraps a localStorage-backed value so components can read it through
 * useSyncExternalStore.
 *
 * The server and the hydration render both see `fallback`, so the markup
 * matches; the stored value is picked up on the first post-hydration read.
 * That avoids restoring state from an effect, which would write state during
 * commit and trigger a second render pass on every mount.
 *
 * getSnapshot caches, because useSyncExternalStore re-renders forever if it
 * returns a fresh object each call.
 */
export function createPersistentStore<T>(
  read: () => T,
  write: (value: T) => void,
  fallback: T
): PersistentStore<T> {
  let snapshot: T = fallback;
  let loaded = false;
  const listeners = new Set<Listener>();

  function emit() {
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      if (!loaded) {
        loaded = true;
        snapshot = read();
      }
      return snapshot;
    },

    getServerSnapshot() {
      return fallback;
    },

    set(value) {
      loaded = true;
      snapshot = value;
      write(value);
      emit();
    },

    sync(value) {
      loaded = true;
      snapshot = value;
      emit();
    },
  };
}
