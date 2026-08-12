import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { scanForDips } from "@/lib/dip-scanner";

export const dynamic = "force-dynamic";
// A full scan fans out across the universe; the platform default is too short.
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "scan");
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      symbols?: string[];
      minScore?: number;
      symbolsOnly?: boolean;
    };

    const result = await scanForDips(
      body.symbols ?? [],
      body.minScore ?? 20,
      body.symbolsOnly ?? false
    );

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Dip scan failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "scan");
  if (limited) return limited;

  try {
    const result = await scanForDips([], 20);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Dip scan failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
