import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { adviseStopLoss } from "@/lib/stop-loss-advisor";
import type { PortfolioHolding, TradeDirection } from "@/lib/types";

export const dynamic = "force-dynamic";
// Fans out one upstream request set per holding.
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "analyze");
  if (limited) return limited;

  try {
    const body = (await request.json()) as {
      holdings?: PortfolioHolding[];
      direction?: TradeDirection;
    };

    const holdings = (body.holdings ?? []).filter(
      (holding) => holding?.symbol?.trim() && holding.shares > 0
    );

    if (holdings.length === 0) {
      return NextResponse.json(
        { error: "Add at least one holding with shares" },
        { status: 400 }
      );
    }

    const direction = body.direction === "short" ? "short" : "long";

    const settled = await Promise.allSettled(
      holdings.map((holding) =>
        adviseStopLoss(holding.symbol, {
          direction,
          shares: holding.shares,
          avgCost: holding.avgCost,
          includeHistory: false,
        })
      )
    );

    const recommendations = settled
      .filter((entry) => entry.status === "fulfilled")
      .map((entry) => (entry as PromiseFulfilledResult<Awaited<ReturnType<typeof adviseStopLoss>>>).value);

    const failures = settled
      .map((entry, index) =>
        entry.status === "rejected"
          ? {
              symbol: holdings[index].symbol.toUpperCase(),
              error:
                entry.reason instanceof Error
                  ? entry.reason.message
                  : "Failed to compute stop",
            }
          : null
      )
      .filter((entry): entry is { symbol: string; error: string } => entry !== null);

    if (recommendations.length === 0) {
      return NextResponse.json(
        { error: failures[0]?.error ?? "No stops could be computed" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        recommendations,
        failures,
        updatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Batch stop-loss failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
