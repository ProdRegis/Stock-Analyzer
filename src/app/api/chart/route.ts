import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { chartIntervalFor, fetchChartRange } from "@/lib/market-data";
import { CHART_RANGES, type ChartRange } from "@/lib/types";

export const dynamic = "force-dynamic";

function asRange(value: string | null): ChartRange | null {
  return CHART_RANGES.includes(value as ChartRange)
    ? (value as ChartRange)
    : null;
}

/**
 * Bars for one symbol over one span. Only the spans the client cannot cut from
 * the daily history it already holds come through here, so this stays quiet
 * unless someone actually clicks 1D, 7D, or 5Y.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.trim().toUpperCase() ?? "";
    const range = asRange(searchParams.get("range"));

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    if (!range) {
      return NextResponse.json(
        { error: `Range must be one of ${CHART_RANGES.join(", ")}` },
        { status: 400 }
      );
    }

    const points = await fetchChartRange(symbol, range);

    return NextResponse.json(
      { symbol, range, interval: chartIntervalFor(range), points },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Chart data unavailable";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
