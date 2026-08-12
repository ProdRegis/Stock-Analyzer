"use client";

import { useEffect, useRef, useState } from "react";
import { Check, LogOut, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { usePersistentStore } from "@/hooks/usePersistentStore";
import { useNow } from "@/hooks/useNow";
import { formatElapsed } from "@/lib/market-hours";
import {
  activeProfileStore,
  createProfile,
  deleteProfile,
  loadSessionStart,
  profilesStore,
  renameProfile,
  switchProfile,
  MAX_PROFILE_NAME_LENGTH,
} from "@/lib/profiles";

export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default function ProfileMenu() {
  const profiles = usePersistentStore(profilesStore);
  const activeId = usePersistentStore(activeProfileStore);
  const now = useNow();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = profiles.find((profile) => profile.id === activeId) ?? null;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setCreating(false);
        setEditingId(null);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setCreating(false);
        setEditingId(null);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!active) return null;

  const sessionStart = activeId ? loadSessionStart(activeId) : null;
  // now is 0 until hydration, so the timer renders blank rather than mismatching.
  const sessionLabel =
    now > 0 && sessionStart != null ? formatElapsed(now - sessionStart) : null;

  function commitDraft() {
    const name = draftName.trim();
    if (!name) {
      setCreating(false);
      setEditingId(null);
      setDraftName("");
      return;
    }

    if (editingId) {
      renameProfile(editingId, name);
    } else {
      const profile = createProfile(name);
      switchProfile(profile.id);
    }

    setCreating(false);
    setEditingId(null);
    setDraftName("");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 py-1.5 pl-1.5 pr-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600/20 text-xs font-semibold text-blue-300">
          {profileInitials(active.name)}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:block">
          {active.name}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/40"
        >
          <div className="border-b border-slate-800 px-4 py-3">
            <p className="truncate text-sm font-semibold text-white">
              {active.name}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              {sessionLabel ? (
                <>Signed in for {sessionLabel}</>
              ) : (
                <>Session starting</>
              )}
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {profiles.map((profile) => {
              const isActive = profile.id === activeId;
              const isEditing = editingId === profile.id;

              if (isEditing) {
                return (
                  <div key={profile.id} className="px-2 py-1">
                    <input
                      autoFocus
                      value={draftName}
                      maxLength={MAX_PROFILE_NAME_LENGTH}
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={commitDraft}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitDraft();
                      }}
                      className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500"
                    />
                  </div>
                );
              }

              return (
                <div
                  key={profile.id}
                  className="group flex items-center gap-1 px-2"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      switchProfile(profile.id);
                      setOpen(false);
                    }}
                    className="flex flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-800 text-[10px] font-semibold text-slate-300">
                      {profileInitials(profile.name)}
                    </span>
                    <span className="flex-1 truncate">{profile.name}</span>
                    {isActive && (
                      <Check
                        className="h-4 w-4 text-emerald-400"
                        aria-label="Current profile"
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label={`Rename ${profile.name}`}
                    onClick={() => {
                      setEditingId(profile.id);
                      setDraftName(profile.name);
                    }}
                    className="rounded p-1.5 text-slate-500 opacity-0 transition hover:bg-slate-800 hover:text-slate-200 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {profiles.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Delete ${profile.name}`}
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Delete "${profile.name}"? Their saved portfolios will be removed from this computer.`
                        );
                        if (confirmed) deleteProfile(profile.id);
                      }}
                      className="rounded p-1.5 text-slate-500 opacity-0 transition hover:bg-slate-800 hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-800 p-2">
            {creating ? (
              <input
                autoFocus
                value={draftName}
                maxLength={MAX_PROFILE_NAME_LENGTH}
                placeholder="Name for the new profile"
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={commitDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitDraft();
                }}
                className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCreating(true);
                  setDraftName("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add profile
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                switchProfile(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
