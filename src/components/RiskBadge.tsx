interface RiskBadgeProps {
  level: "Low" | "Moderate" | "High" | "Very High";
  score?: number;
  size?: "sm" | "md" | "lg";
}

const styles = {
  Low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Moderate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  High: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  "Very High": "bg-red-500/15 text-red-300 border-red-500/30",
};

const sizes = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-sm",
  lg: "px-4 py-2 text-base",
};

export default function RiskBadge({
  level,
  score,
  size = "md",
}: RiskBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${styles[level]} ${sizes[size]}`}
    >
      {level} Risk
      {score !== undefined && (
        <span className="opacity-70">({score}/100)</span>
      )}
    </span>
  );
}
