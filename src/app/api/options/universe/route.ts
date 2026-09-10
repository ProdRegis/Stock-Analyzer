import { NextResponse } from "next/server";
import { buildOptionsUniverseScan } from "@/lib/options-desk";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "scan");
  if (limited) return limited;

  try {
    const scan = await buildOptionsUniverseScan();
    return NextResponse.json(scan, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Options universe scan failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
