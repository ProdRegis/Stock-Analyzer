import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { searchMarket } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "search");
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    if (query.length < 1) {
      return NextResponse.json({ results: [] });
    }

    const results = await searchMarket(query);

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
