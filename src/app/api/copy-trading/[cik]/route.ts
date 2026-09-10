import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadThirteenFReport } from "@/lib/thirteen-f";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cik: string }> }
) {
  const limited = enforceRateLimit(request, "read");
  if (limited) return limited;

  try {
    const { cik } = await params;
    const report = await loadThirteenFReport(cik, {
      query: new URL(request.url).searchParams.get("q") ?? undefined,
    });
    return NextResponse.json(report, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load 13F";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
