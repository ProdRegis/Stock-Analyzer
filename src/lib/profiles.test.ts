import { beforeEach, describe, expect, it } from "vitest";
import {
  PORTFOLIO_STORAGE_KEY,
  PROFILES_STORAGE_KEY,
  WORKING_PORTFOLIO_STORAGE_KEY,
} from "./constants";

/** Minimal in-memory localStorage; the test environment is Node, not a DOM. */
class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { value: storage });
Object.defineProperty(globalThis, "window", { value: globalThis });

// Imported after the globals exist, since the modules read them on first use.
const {
  activeProfileStore,
  createProfile,
  deleteProfile,
  loadSessionStart,
  migrateLegacyData,
  normalizeProfileName,
  profileScopedKey,
  profilesStore,
  renameProfile,
  resetMigrationCheck,
  switchProfile,
} = await import("./profiles");

const { savedPortfoliosStore, workingPortfolioStore } = await import(
  "./portfolios"
);

beforeEach(() => {
  storage.clear();
  resetMigrationCheck();
  profilesStore.reload();
  activeProfileStore.reload();
  workingPortfolioStore.reload();
  savedPortfoliosStore.reload();
});

describe("normalizeProfileName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeProfileName("  Alex   Smith  ")).toBe("Alex Smith");
  });

  it("caps the length so the header button cannot be broken", () => {
    expect(normalizeProfileName("a".repeat(80))).toHaveLength(24);
  });
});

describe("profileScopedKey", () => {
  it("keeps different profiles on different keys", () => {
    expect(profileScopedKey("base", "p1")).not.toBe(
      profileScopedKey("base", "p2")
    );
  });
});

describe("profile lifecycle", () => {
  it("creates a profile without selecting it", () => {
    const profile = createProfile("Alex");

    expect(profilesStore.getSnapshot()).toHaveLength(1);
    expect(profile.name).toBe("Alex");
    expect(activeProfileStore.getSnapshot()).toBeNull();
  });

  it("falls back to a placeholder for a blank name", () => {
    expect(createProfile("   ").name).toBe("New profile");
  });

  it("renames in place", () => {
    const profile = createProfile("Alex");
    renameProfile(profile.id, "Alexandra");

    expect(profilesStore.getSnapshot()[0].name).toBe("Alexandra");
  });

  it("ignores a rename to an empty name", () => {
    const profile = createProfile("Alex");
    renameProfile(profile.id, "   ");

    expect(profilesStore.getSnapshot()[0].name).toBe("Alex");
  });
});

describe("data isolation between profiles", () => {
  it("keeps each profile's working portfolio separate", () => {
    const alex = createProfile("Alex");
    const sam = createProfile("Sam");

    switchProfile(alex.id);
    workingPortfolioStore.set([{ symbol: "AAPL", shares: 10 }]);

    switchProfile(sam.id);
    expect(workingPortfolioStore.getSnapshot()).toBeNull();

    workingPortfolioStore.set([{ symbol: "TSLA", shares: 3 }]);
    expect(workingPortfolioStore.getSnapshot()).toEqual([
      { symbol: "TSLA", shares: 3, avgCost: undefined },
    ]);

    switchProfile(alex.id);
    expect(workingPortfolioStore.getSnapshot()).toEqual([
      { symbol: "AAPL", shares: 10, avgCost: undefined },
    ]);
  });

  it("reads and writes nothing while logged out", () => {
    const alex = createProfile("Alex");
    switchProfile(alex.id);
    workingPortfolioStore.set([{ symbol: "AAPL", shares: 10 }]);

    switchProfile(null);
    expect(workingPortfolioStore.getSnapshot()).toBeNull();

    // A write with nobody signed in must not land on the last profile's key.
    workingPortfolioStore.set([{ symbol: "HACK", shares: 1 }]);
    switchProfile(alex.id);
    expect(workingPortfolioStore.getSnapshot()).toEqual([
      { symbol: "AAPL", shares: 10, avgCost: undefined },
    ]);
  });

  it("removes a deleted profile's stored data", () => {
    const alex = createProfile("Alex");
    switchProfile(alex.id);
    workingPortfolioStore.set([{ symbol: "AAPL", shares: 10 }]);

    const key = profileScopedKey(WORKING_PORTFOLIO_STORAGE_KEY, alex.id);
    expect(storage.getItem(key)).not.toBeNull();

    deleteProfile(alex.id);
    expect(storage.getItem(key)).toBeNull();
    expect(profilesStore.getSnapshot()).toHaveLength(0);
  });

  it("logs out when the active profile is deleted", () => {
    const alex = createProfile("Alex");
    switchProfile(alex.id);

    deleteProfile(alex.id);
    expect(activeProfileStore.getSnapshot()).toBeNull();
  });

  it("stays logged in when a different profile is deleted", () => {
    const alex = createProfile("Alex");
    const sam = createProfile("Sam");
    switchProfile(alex.id);

    deleteProfile(sam.id);
    expect(activeProfileStore.getSnapshot()).toBe(alex.id);
  });
});

describe("session clock", () => {
  it("starts a session on sign-in", () => {
    const alex = createProfile("Alex");
    switchProfile(alex.id);

    expect(loadSessionStart(alex.id)).toBeTypeOf("number");
  });

  it("does not report one profile's session start for another", () => {
    const alex = createProfile("Alex");
    const sam = createProfile("Sam");

    switchProfile(alex.id);
    expect(loadSessionStart(sam.id)).toBeNull();
  });

  it("keeps the original start time across a re-read, so a refresh continues it", () => {
    const alex = createProfile("Alex");
    switchProfile(alex.id);
    const started = loadSessionStart(alex.id);

    switchProfile(alex.id);
    expect(loadSessionStart(alex.id)).toBe(started);
  });
});

describe("migration of pre-profile data", () => {
  /**
   * The outer beforeEach reads the profile store, which runs the migration on
   * empty storage. These cases need to set up legacy data first, so they wind
   * that back to a genuinely untouched browser.
   */
  function untouchedBrowser() {
    storage.clear();
    resetMigrationCheck();
  }

  it("moves existing holdings into a first profile and signs it in", () => {
    untouchedBrowser();
    const legacy = JSON.stringify([{ symbol: "AAPL", shares: 4 }]);
    storage.setItem(WORKING_PORTFOLIO_STORAGE_KEY, legacy);

    migrateLegacyData();

    const profiles = profilesStore.getSnapshot();
    expect(profiles).toHaveLength(1);
    expect(activeProfileStore.getSnapshot()).toBe(profiles[0].id);

    expect(
      storage.getItem(
        profileScopedKey(WORKING_PORTFOLIO_STORAGE_KEY, profiles[0].id)
      )
    ).toBe(legacy);
    // The original key is cleared so a later migration cannot duplicate it.
    expect(storage.getItem(WORKING_PORTFOLIO_STORAGE_KEY)).toBeNull();
  });

  it("carries saved portfolios across too", () => {
    untouchedBrowser();
    const saved = JSON.stringify([{ id: "p1", name: "Growth", holdings: [] }]);
    storage.setItem(PORTFOLIO_STORAGE_KEY, saved);

    migrateLegacyData();
    const [profile] = profilesStore.getSnapshot();

    expect(
      storage.getItem(profileScopedKey(PORTFOLIO_STORAGE_KEY, profile.id))
    ).toBe(saved);
  });

  it("invents no profile for a visitor with nothing to migrate", () => {
    // Otherwise a first-time visitor meets a profile named "Main" that they
    // never created, instead of the welcome screen.
    untouchedBrowser();

    migrateLegacyData();

    expect(profilesStore.getSnapshot()).toEqual([]);
    expect(activeProfileStore.getSnapshot()).toBeNull();
  });

  it("does nothing once profiles already exist", () => {
    untouchedBrowser();
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([]));
    storage.setItem(WORKING_PORTFOLIO_STORAGE_KEY, "[]");

    migrateLegacyData();

    expect(profilesStore.getSnapshot()).toHaveLength(0);
    expect(storage.getItem(WORKING_PORTFOLIO_STORAGE_KEY)).toBe("[]");
  });

  it("runs automatically on the first store read", () => {
    untouchedBrowser();
    storage.setItem(
      WORKING_PORTFOLIO_STORAGE_KEY,
      JSON.stringify([{ symbol: "AAPL", shares: 4 }])
    );

    // No explicit migrate call; reading the profile list should trigger it.
    profilesStore.reload();
    expect(profilesStore.getSnapshot()).toHaveLength(1);
  });
});

describe("corrupt storage", () => {
  it("ignores unparseable profile data", () => {
    storage.setItem(PROFILES_STORAGE_KEY, "{{{");
    profilesStore.reload();

    expect(profilesStore.getSnapshot()).toEqual([]);
  });

  it("drops entries that are not shaped like profiles", () => {
    storage.setItem(
      PROFILES_STORAGE_KEY,
      JSON.stringify([{ id: "ok", name: "Alex", createdAt: 1 }, { id: 7 }, null])
    );
    profilesStore.reload();

    expect(profilesStore.getSnapshot()).toHaveLength(1);
  });

  it("treats a pointer to a deleted profile as logged out", () => {
    storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([]));
    storage.setItem("portfolio-risk-analyzer:active-profile", "gone");
    activeProfileStore.reload();

    expect(activeProfileStore.getSnapshot()).toBeNull();
  });
});
