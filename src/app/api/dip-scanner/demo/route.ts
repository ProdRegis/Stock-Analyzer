import { NextResponse } from "next/server";
import { TTL, cached } from "@/lib/cache";
import { enforceRateLimit } from "@/lib/rate-limit";
import { scanForDips } from "@/lib/dip-scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The sample scan new visitors land on. See the breakout demo route for why
 * this is metered as a read rather than a scan.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const result = await cached("demo:dips", TTL.demoScan, () =>
      scanForDips([], "balanced")
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
