import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { analyzeStock } from "@/lib/yahoo";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const { symbol } = await params;
    const analysis = await analyzeStock(symbol);
    return NextResponse.json(analysis);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze stock";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
