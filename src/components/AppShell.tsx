"use client";

import Dashboard from "./Dashboard";
import Header from "./Header";
import MadeByTag from "./MadeByTag";
import ProfileGate from "./ProfileGate";
import { usePersistentStore } from "@/hooks/usePersistentStore";
import { useIsHydrated } from "@/hooks/useIsHydrated";
import { activeProfileStore } from "@/lib/profiles";

export default function AppShell() {
  const hydrated = useIsHydrated();
  const activeProfileId = usePersistentStore(activeProfileStore);

  // Which branch to show depends on localStorage, which the server cannot
  // read. Holding back one paint avoids flashing the sign-in screen at someone
  // who is already signed in.
  if (!hydrated) {
    return <div className="min-h-screen bg-slate-950" aria-hidden="true" />;
  }

  if (activeProfileId === null) {
    return (
      <div className="min-h-screen bg-slate-950">
        <ProfileGate />
        <MadeByTag />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Header />

      <main className="px-4 py-8 sm:px-6">
        <Dashboard />
      </main>

      <MadeByTag />
    </div>
  );
}
