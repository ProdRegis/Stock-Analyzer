import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  alignedMultiSeriesReturns,
  averageCorrelation,
  correlationMatrix,
  diversificationScore,
  herfindahlIndex,
  portfolioVolatilityAligned,
  riskLevel,
  riskScore,
} from "@/lib/risk";
import { fetchRiskFreeRate } from "@/lib/market-rates";
import {
  fetchDailyHistory,
  fetchQuote,
  mergeLiveQuoteIntoHistory,
} from "@/lib/market-data";
import { analyzeStock } from "@/lib/yahoo";
import type {
  PortfolioAnalysis,
  PortfolioHolding,
  PortfolioPositionPnl,
} from "@/lib/types";

// Fans out one upstream request set per holding.
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "analyze");
  if (limited) return limited;

  try {
    const body = (await request.json()) as { holdings: PortfolioHolding[] };

    if (!body.holdings?.length) {
      return NextResponse.json(
        { error: "Add at least one holding to analyze" },
        { status: 400 }
      );
    }

    const [{ rate, source: riskFreeSource }, spyDaily, spyQuote] =
      await Promise.all([
        fetchRiskFreeRate(),
        fetchDailyHistory("SPY"),
        fetchQuote("SPY"),
      ]);

    const spyHistory = mergeLiveQuoteIntoHistory(
      spyDaily,
      spyQuote as Record<string, unknown>
    );

    const analyses = await Promise.all(
      body.holdings.map((holding) =>
        analyzeStock(holding.symbol, {
          marketHistory: spyHistory,
          riskFreeRate: rate,
          riskFreeSource,
        })
      )
    );

    const values = body.holdings.map(
      (holding, index) => holding.shares * analyses[index].currentPrice
    );
    const totalValue = values.reduce((sum, value) => sum + value, 0);

    if (totalValue === 0) {
      return NextResponse.json(
        { error: "Portfolio value must be greater than zero" },
        { status: 400 }
      );
    }

    const weights = values.map((value) => value / totalValue);
    const histories = analyses.map((analysis) => analysis.history);
    const alignedReturns = alignedMultiSeriesReturns(histories);

    const portfolioBeta = weights.reduce(
      (sum, weight, index) => sum + weight * analyses[index].risk.beta,
      0
    );

    const portfolioVol = portfolioVolatilityAligned(weights, alignedReturns);
    const avgCorr = averageCorrelation(alignedReturns);
    const concentration = herfindahlIndex(weights);
    const diversification = diversificationScore(weights);

    const weightedDrawdown = weights.reduce(
      (sum, weight, index) =>
        sum + weight * analyses[index].risk.maxDrawdown,
      0
    );

    const score = riskScore(portfolioVol, portfolioBeta, weightedDrawdown);

    const positionPnls: Array<PortfolioPositionPnl | null> = body.holdings.map(
      (holding, index) => {
        const avgCost = holding.avgCost;
        if (avgCost == null || !Number.isFinite(avgCost) || avgCost <= 0) {
          return null;
        }

        const costBasis = avgCost * holding.shares;
        const unrealizedGain = values[index] - costBasis;

        return {
          avgCost,
          costBasis,
          unrealizedGain,
          unrealizedGainPercent:
            costBasis > 0 ? (unrealizedGain / costBasis) * 100 : 0,
        };
      }
    );

    const pricedPnls = positionPnls.filter(
      (pnl): pnl is PortfolioPositionPnl => pnl !== null
    );
    const costBasisComplete =
      pricedPnls.length === body.holdings.length && pricedPnls.length > 0;

    const totalCostBasis =
      pricedPnls.length > 0
        ? pricedPnls.reduce((sum, pnl) => sum + pnl.costBasis, 0)
        : null;
    const totalUnrealizedGain =
      pricedPnls.length > 0
        ? pricedPnls.reduce((sum, pnl) => sum + pnl.unrealizedGain, 0)
        : null;

    const result: PortfolioAnalysis = {
      holdings: body.holdings.map((holding, index) => ({
        symbol: holding.symbol.toUpperCase(),
        shares: holding.shares,
        weight: weights[index],
        value: values[index],
        pnl: positionPnls[index],
        analysis: analyses[index],
      })),
      totalValue,
      totalCostBasis,
      totalUnrealizedGain,
      totalUnrealizedGainPercent:
        totalCostBasis != null && totalCostBasis > 0 && totalUnrealizedGain != null
          ? (totalUnrealizedGain / totalCostBasis) * 100
          : null,
      costBasisComplete,
      portfolioRisk: {
        annualizedVolatility: portfolioVol,
        beta: portfolioBeta,
        riskScore: score,
        riskLevel: riskLevel(score),
        diversificationScore: diversification,
        concentrationRisk: Math.round(concentration * 100),
        avgCorrelation: avgCorr,
        correlationSymbols: body.holdings.map((holding) =>
          holding.symbol.toUpperCase()
        ),
        correlationMatrix: correlationMatrix(alignedReturns),
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze portfolio";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
