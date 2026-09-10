import { NextResponse } from "next/server";
import { buildOptionsScan } from "@/lib/options-desk";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "scan");
  if (limited) return limited;

  try {
    const body = (await request.json()) as { symbols?: unknown };
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.filter((item): item is string => typeof item === "string")
      : [];
    if (symbols.length === 0) {
      return NextResponse.json(
        { error: "Add at least one symbol to scan" },
        { status: 400 }
      );
    }

    const scan = await buildOptionsScan(symbols);
    return NextResponse.json(scan, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Options scan failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
