import { NextResponse } from "next/server";
import { TTL, cached } from "@/lib/cache";
import { enforceRateLimit } from "@/lib/rate-limit";
import { scanForBreakouts } from "@/lib/breakout-scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The sample scan new visitors land on.
 *
 * One cached result is shared by everyone, and concurrent misses are coalesced
 * into a single scan, so a burst of first-time visitors costs one fan-out
 * rather than one each. That is why this is metered as a cheap read.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const result = await cached("demo:breakouts", TTL.demoScan, () =>
      scanForBreakouts([], 15)
    );

    return NextResponse.json(
      { ...result, demo: true },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sample scan unavailable";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
