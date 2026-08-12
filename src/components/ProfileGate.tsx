"use client";

import { useState } from "react";
import { ChartCandlestick, Plus, UserRound } from "lucide-react";
import { usePersistentStore } from "@/hooks/usePersistentStore";
import {
  createProfile,
  profilesStore,
  switchProfile,
  MAX_PROFILE_NAME_LENGTH,
} from "@/lib/profiles";
import { profileInitials } from "./ProfileMenu";

/**
 * Shown when no profile is selected, either on a first visit or after logging
 * out. This is a "who is using this computer" chooser, not an authentication
 * step — the shared site password already decided that.
 */
export default function ProfileGate() {
  const profiles = usePersistentStore(profilesStore);
  const [name, setName] = useState("");

  const firstRun = profiles.length === 0;

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;

    const profile = createProfile(trimmed);
    switchProfile(profile.id);
    setName("");
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="surface-1 w-full max-w-md rounded-2xl p-8">
        <div className="flex flex-col items-center text-center">
          <span className="rounded-xl bg-blue-600/15 p-3 text-blue-400">
            <ChartCandlestick className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold text-white">
            {firstRun ? "Welcome" : "Who's using this?"}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {firstRun
              ? "Create a profile to keep your portfolios separate from anyone else who uses this computer."
              : "Pick your profile to load your saved portfolios."}
          </p>
        </div>

        {profiles.length > 0 && (
          <ul className="mt-6 space-y-2">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => switchProfile(profile.id)}
                  className="surface-3 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:border-blue-500/50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/20 text-sm font-semibold text-blue-300">
                    {profileInitials(profile.name)}
                  </span>
                  <span className="flex-1 truncate font-medium text-white">
                    {profile.name}
                  </span>
                  <UserRound
                    className="h-4 w-4 text-slate-500"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 border-t border-slate-800 pt-6">
          <label
            htmlFor="new-profile-name"
            className="block text-sm font-medium text-slate-300"
          >
            {firstRun ? "Your name" : "Or add someone new"}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="new-profile-name"
              value={name}
              maxLength={MAX_PROFILE_NAME_LENGTH}
              placeholder="e.g. Alex"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={submit}
              disabled={!name.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Profiles are stored only in this browser and are not password
            protected. They keep portfolios separate, not private.
          </p>
        </div>
      </div>
    </main>
  );
}
