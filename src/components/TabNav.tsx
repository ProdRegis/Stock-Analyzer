"use client";

import {
  Briefcase,
  Landmark,
  Newspaper,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export type DashboardTab =
  | "portfolio"
  | "breakouts"
  | "picks"
  | "stop-loss"
  | "copy-trading"
  | "news";

interface TabNavProps {
  activeTab: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

const tabs: Array<{ id: DashboardTab; label: string; icon: LucideIcon }> = [
  { id: "portfolio", label: "Portfolio Analysis", icon: Briefcase },
  { id: "breakouts", label: "Breakout Scanner", icon: TrendingUp },
  { id: "picks", label: "Dips & Shorts", icon: Sparkles },
  { id: "stop-loss", label: "Safety Stops", icon: ShieldAlert },
  { id: "copy-trading", label: "Copy Trading", icon: Landmark },
  { id: "news", label: "News & Events", icon: Newspaper },
];

export default function TabNav({ activeTab, onChange }: TabNavProps) {
  return (
    <nav
      aria-label="Dashboard sections"
      className="surface-2 flex gap-1 overflow-x-auto rounded-xl p-1"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
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
  );
}
