import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadCongressPtrReport } from "@/lib/house-ptr";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const last = searchParams.get("last")?.trim() ?? "";
    const first = searchParams.get("first")?.trim() ?? "";
    if (!last || !first) {
      return NextResponse.json(
        { error: "Need a last and first name" },
        { status: 400 }
      );
    }

    const report = await loadCongressPtrReport(last, first);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load STOCK Act filings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
