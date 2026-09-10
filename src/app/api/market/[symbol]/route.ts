import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { fetchCompanyDetails } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const { symbol } = await params;
    const details = await fetchCompanyDetails(symbol);

    return NextResponse.json(details, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch company data";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
