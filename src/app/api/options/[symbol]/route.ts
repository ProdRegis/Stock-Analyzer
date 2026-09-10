import { NextResponse } from "next/server";
import { buildOptionsDesk } from "@/lib/options-desk";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const limited = enforceRateLimit(request, "analyze");
  if (limited) return limited;

  try {
    const { symbol } = await params;
    const expiry = new URL(request.url).searchParams.get("expiry") ?? undefined;
    const desk = await buildOptionsDesk(symbol, expiry ?? undefined);
    return NextResponse.json(desk, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load options";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
