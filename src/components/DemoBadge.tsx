import { FlaskConical } from "lucide-react";

export default function DemoBadge({ label = "Sample data" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-300">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
