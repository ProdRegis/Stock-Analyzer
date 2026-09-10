"use client";

import {
  Activity,
  BookOpen,
  Briefcase,
  Landmark,
  Newspaper,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Waves,
  type LucideIcon,
} from "lucide-react";

export type DashboardTab =
  | "portfolio"
  | "thesis"
  | "breakouts"
  | "picks"
  | "stop-loss"
  | "copy-trading"
  | "news"
  | "options"
  | "vol-screen";

interface TabNavProps {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

const groups: Array<{
  label: string;
  tabs: Array<{ id: DashboardTab; label: string; icon: LucideIcon }>;
}> = [
  {
    label: "Research",
    tabs: [
      { id: "portfolio", label: "Portfolio", icon: Briefcase },
      { id: "thesis", label: "Thesis", icon: BookOpen },
      { id: "options", label: "Options", icon: Activity },
      { id: "news", label: "News", icon: Newspaper },
    ],
  },
  {
    label: "Find names",
    tabs: [
      { id: "breakouts", label: "Breakouts", icon: TrendingUp },
      { id: "picks", label: "Dips & Shorts", icon: Sparkles },
      { id: "stop-loss", label: "Stops", icon: ShieldAlert },
      { id: "copy-trading", label: "Copy Trading", icon: Landmark },
      { id: "vol-screen", label: "Vol screen", icon: Waves },
    ],
  },
];

export default function TabNav({ activeTab, onChange }: TabNavProps) {
  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.label} className="flex items-center gap-2">
          <span className="w-[4.75rem] shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {group.label}
          </span>
          <nav
            aria-label={group.label}
            className="surface-2 flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl p-1"
          >
            {group.tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onChange(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition sm:px-4 sm:py-2.5 ${
                    active
                      ? "bg-blue-600 text-black shadow-sm"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon
                    className="h-4 w-4"
                    strokeWidth={active ? 2.25 : 2}
                    aria-hidden="true"
                  />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}
