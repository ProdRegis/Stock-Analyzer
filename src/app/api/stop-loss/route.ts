import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { adviseStopLoss } from "@/lib/stop-loss-advisor";
import type { TradeDirection } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "analyze");
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      symbol?: string;
      direction?: TradeDirection;
      shares?: number;
      avgCost?: number;
    };

    if (!body.symbol?.trim()) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const result = await adviseStopLoss(body.symbol, {
      direction: body.direction === "short" ? "short" : "long",
      shares: body.shares,
      avgCost: body.avgCost,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stop-loss recommendation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
