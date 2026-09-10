import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { searchThirteenFFilers } from "@/lib/thirteen-f";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "search");
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    const results = await searchThirteenFFilers(query);
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
