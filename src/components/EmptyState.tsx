import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "neutral" | "notice";
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
}: EmptyStateProps) {
  const notice = tone === "notice";

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border border-dashed px-6 py-12 text-center ${
        notice
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-slate-700/60 bg-slate-900/30"
      }`}
    >
      <span
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
          notice
            ? "bg-amber-500/10 text-amber-300"
            : "bg-slate-800/80 text-slate-500"
        }`}
      >
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <p
        className={`text-base font-medium ${
          notice ? "text-amber-100" : "text-slate-200"
        }`}
      >
        {title}
      </p>
      <p className="mt-1.5 max-w-md text-sm text-slate-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
