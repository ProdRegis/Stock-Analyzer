import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fetchNewsFeed } from "@/lib/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");
    const symbols = symbolsParam
      ? symbolsParam.split(",").map((symbol) => symbol.trim().toUpperCase())
      : [];

    const feed = await fetchNewsFeed(symbols);

    return NextResponse.json(feed, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch news";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
