import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fetchQuote } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const quote = await fetchQuote("SPY");

    return NextResponse.json(
      {
        marketState: quote.marketState ?? "UNKNOWN",
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ marketState: "UNKNOWN", updatedAt: null });
  }
}
