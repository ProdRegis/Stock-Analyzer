import type { BusinessQuality, BusinessQualityGrade } from "@/lib/types";

const styles: Record<BusinessQualityGrade, string> = {
  Durable: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Fair: "bg-slate-800 text-slate-300 border-slate-600/60",
  Speculative: "bg-amber-500/15 text-amber-200 border-amber-500/30",
  Pass: "bg-red-500/15 text-red-300 border-red-500/30",
};

export default function BusinessQualityBadge({
  quality,
  size = "md",
}: {
  quality: BusinessQuality | undefined;
  size?: "sm" | "md";
}) {
  if (!quality) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${styles[quality.grade]} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
      title={quality.summary}
    >
      {quality.grade} business
    </span>
  );
}
