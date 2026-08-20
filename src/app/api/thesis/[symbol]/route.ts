import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { generateInvestmentThesis } from "@/lib/investment-thesis";

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
    const trimmed = symbol.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
    }

    const thesis = await generateInvestmentThesis(trimmed);
    return NextResponse.json(thesis, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build thesis";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
