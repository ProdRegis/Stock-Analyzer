/**
 * Local profiles, so people sharing one computer keep separate portfolios.
 *
 * This is data separation, not security. Anyone at the keyboard can select any
 * profile — the shared site password is what controls access, and this only
 * decides whose holdings are on screen. Everything lives in localStorage; there
 * is no server-side user record.
 */

import {
  ACTIVE_PROFILE_STORAGE_KEY,
  PROFILES_STORAGE_KEY,
  PROFILE_SCOPED_KEYS,
  SESSION_STARTED_STORAGE_KEY,
} from "./constants";
import { createPersistentStore, type PersistentStore } from "./persistent-store";

export interface Profile {
  id: string;
  name: string;
  createdAt: number;
}

export const MAX_PROFILE_NAME_LENGTH = 24;

/** Suffixes a base storage key so each profile reads and writes its own copy. */
export function profileScopedKey(baseKey: string, profileId: string): string {
  return `${baseKey}::${profileId}`;
}

function createProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeProfileName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_PROFILE_NAME_LENGTH);
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.createdAt === "number"
  );
}

export function loadProfiles(): Profile[] {
  if (typeof window === "undefined") return [];
  ensureMigrated();

  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isProfile) : [];
  } catch {
    return [];
  }
}

export function persistProfiles(profiles: Profile[]): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // Storage full or blocked; the session still works in memory.
  }
}

export function loadActiveProfileId(): string | null {
  if (typeof window === "undefined") return null;
  ensureMigrated();

  try {
    const id = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    if (!id) return null;
    // A stale id would leave the app pointing at data that no longer exists.
    return loadProfiles().some((profile) => profile.id === id) ? id : null;
  } catch {
    return null;
  }
}

export function persistActiveProfileId(id: string | null): void {
  if (typeof window === "undefined") return;

  try {
    if (id === null) localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    else localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, id);
  } catch {
    // Ignored, as above.
  }
}

export const profilesStore: PersistentStore<Profile[]> = createPersistentStore(
  loadProfiles,
  persistProfiles,
  []
);

export const activeProfileStore: PersistentStore<string | null> =
  createPersistentStore(loadActiveProfileId, persistActiveProfileId, null);

/**
 * Stores whose backing key depends on the active profile. They are registered
 * rather than imported so this module stays free of a cycle with the modules
 * that define them.
 */
const scopedStores = new Set<Pick<PersistentStore<unknown>, "reload">>();

export function registerProfileScopedStore(
  store: Pick<PersistentStore<unknown>, "reload">
): void {
  scopedStores.add(store);
}

function reloadScopedStores(): void {
  for (const store of scopedStores) store.reload();
}

// --- Session clock -------------------------------------------------------

/**
 * When the active profile signed in. Persisted so a page refresh continues the
 * session rather than restarting the clock, but tied to the profile id so a
 * switch always starts fresh.
 */
export function loadSessionStart(profileId: string): number | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(SESSION_STARTED_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    if (record.profileId !== profileId) return null;
    return typeof record.startedAt === "number" ? record.startedAt : null;
  } catch {
    return null;
  }
}

export function persistSessionStart(profileId: string, startedAt: number): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      SESSION_STARTED_STORAGE_KEY,
      JSON.stringify({ profileId, startedAt })
    );
  } catch {
    // Ignored; the timer falls back to this page load.
  }
}

// --- Mutations -----------------------------------------------------------

export function createProfile(rawName: string): Profile {
  const name = normalizeProfileName(rawName) || "New profile";
  const profile: Profile = {
    id: createProfileId(),
    name,
    createdAt: Date.now(),
  };

  profilesStore.set([...profilesStore.getSnapshot(), profile]);
  return profile;
}

export function renameProfile(id: string, rawName: string): void {
  const name = normalizeProfileName(rawName);
  if (!name) return;

  profilesStore.set(
    profilesStore
      .getSnapshot()
      .map((profile) => (profile.id === id ? { ...profile, name } : profile))
  );
}

/** Switches profiles and repoints every profile-scoped store at the new data. */
export function switchProfile(id: string | null): void {
  activeProfileStore.set(id);

  if (id !== null && loadSessionStart(id) === null) {
    persistSessionStart(id, Date.now());
  }

  reloadScopedStores();
}

export function deleteProfile(id: string): void {
  // Remove the profile's own data too, otherwise it lingers in storage
  // unreachable and a recreated profile could inherit it.
  if (typeof window !== "undefined") {
    for (const baseKey of PROFILE_SCOPED_KEYS) {
      try {
        localStorage.removeItem(profileScopedKey(baseKey, id));
      } catch {
        // Ignored.
      }
    }
  }

  const remaining = profilesStore
    .getSnapshot()
    .filter((profile) => profile.id !== id);
  profilesStore.set(remaining);

  if (activeProfileStore.getSnapshot() === id) {
    switchProfile(null);
  }
}

// --- One-time migration --------------------------------------------------

let migrationChecked = false;

/**
 * Runs the migration at most once per page load, before the first read of
 * either profile store. Called from the loaders rather than at import time so
 * it stays out of the server bundle's evaluation path and remains testable.
 */
function ensureMigrated(): void {
  if (migrationChecked) return;
  migrationChecked = true;
  migrateLegacyData();
}

/** Test seam, so each case starts from a clean migration state. */
export function resetMigrationCheck(): void {
  migrationChecked = false;
}

/**
 * Moves pre-profile data into a first profile so an existing user's portfolios
 * survive the upgrade. Runs once: after it, the profiles key exists and this
 * becomes a no-op.
 */
export function migrateLegacyData(defaultName = "Main"): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(PROFILES_STORAGE_KEY) !== null) return;

  const legacy = PROFILE_SCOPED_KEYS.map((baseKey) => ({
    baseKey,
    value: localStorage.getItem(baseKey),
  })).filter((entry) => entry.value !== null);

  // Nothing to carry over. Write the empty list so this does not run again,
  // and leave the profile list genuinely empty — a first-time visitor should
  // name themselves on the welcome screen, not inherit an invented profile.
  if (legacy.length === 0) {
    persistProfiles([]);
    profilesStore.sync([]);
    return;
  }

  const profile: Profile = {
    id: createProfileId(),
    name: defaultName,
    createdAt: Date.now(),
  };

  for (const { baseKey, value } of legacy) {
    try {
      localStorage.setItem(profileScopedKey(baseKey, profile.id), value!);
      localStorage.removeItem(baseKey);
    } catch {
      // If the copy fails, leave the original in place rather than losing it.
    }
  }

  persistProfiles([profile]);
  profilesStore.sync([profile]);

  // Existing data means an existing user, so return them straight to it
  // rather than making them pick a profile they never created.
  persistActiveProfileId(profile.id);
  activeProfileStore.sync(profile.id);
  persistSessionStart(profile.id, Date.now());
}
