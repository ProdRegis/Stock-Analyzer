import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { refreshCandidatesLive } from "@/lib/breakout-scanner";
import type { BreakoutCandidate } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "live");
  if (limited) return limited;

  try {
    const body = (await request.json()) as { candidates: BreakoutCandidate[] };

    if (!body.candidates?.length) {
      return NextResponse.json(
        { error: "No candidates to refresh" },
        { status: 400 }
      );
    }

    const result = await refreshCandidatesLive(body.candidates);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Live refresh failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
