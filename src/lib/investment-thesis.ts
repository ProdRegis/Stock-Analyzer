import { scoreBusinessQuality } from "./business-quality";
import { TTL, cached } from "./cache";
import { peerSymbolsInUniverse } from "./constants";
import {
  fetchFundamentals,
  type CompanyFundamentals,
} from "./fundamentals";
import { fetchRiskFreeRate } from "./market-rates";
import {
  conservativeGrowth,
  impliedReturn,
  valueAtDiscountRate,
} from "./reverse-dcf";
import type {
  BusinessQuality,
  InvestmentThesis,
  ThesisPeer,
  ThesisScreenFlag,
  ThesisStance,
  ThesisValuationMethod,
} from "./types";

const TERMINAL_GROWTH = 0.025;
const FORECAST_YEARS = 8;
const MARKET_FORWARD_PE = 22;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function money(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

function firstSentences(text: string | null, count: number): string | null {
  if (!text) return null;
  const compact = text.replace(/\s+/g, " ").trim();
  const parts = compact.match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length === 0) return compact;
  return parts.slice(0, count).join(" ").trim();
}

function buildScreen(fundamentals: CompanyFundamentals): {
  kickOut: boolean;
  kickOutReason: string | null;
  flags: ThesisScreenFlag[];
} {
  const flags: ThesisScreenFlag[] = [];
  const profitable =
    (fundamentals.profitMargins ?? -1) > 0 &&
    (fundamentals.operatingMargins ?? -1) > 0;
  const fcf = fundamentals.freeCashflow;
  const debt = fundamentals.debtToEquity;
  const growth = fundamentals.revenueGrowth;

  if (profitable) {
    flags.push({
      label: `Profitable (op. margin ${pct(fundamentals.operatingMargins ?? 0)})`,
      tone: "good",
    });
  } else {
    flags.push({
      label: "Loss-making — harder analysis",
      tone: "bad",
    });
  }

  if (fcf != null && fcf > 0) {
    flags.push({ label: `Free cash flow ${money(fcf)}`, tone: "good" });
  } else if (fcf != null) {
    flags.push({ label: `Cash burn ${money(fcf)}`, tone: "bad" });
  }

  if (debt != null && debt > 250) {
    flags.push({ label: `Heavy debt (D/E ${debt.toFixed(0)})`, tone: "bad" });
  } else if (debt != null && debt > 150) {
    flags.push({ label: `Elevated debt (D/E ${debt.toFixed(0)})`, tone: "warn" });
  } else if (debt != null) {
    flags.push({ label: `Manageable leverage (D/E ${debt.toFixed(0)})`, tone: "good" });
  }

  if (growth != null && growth > 0.05) {
    flags.push({ label: `Revenue growing ${pct(growth)}`, tone: "good" });
  } else if (growth != null && growth < 0) {
    flags.push({ label: `Revenue shrinking ${pct(growth)}`, tone: "warn" });
  }

  if (fundamentals.returnOnEquity != null && fundamentals.returnOnEquity >= 0.15) {
    flags.push({
      label: `High ROE ${pct(fundamentals.returnOnEquity)}`,
      tone: "good",
    });
  }

  const kickOut =
    (!profitable && (debt ?? 0) > 250) ||
    ((fundamentals.totalRevenue ?? 0) <= 0 && !profitable);

  const kickOutReason = kickOut
    ? "Kick this out of the buy list for now: it is not a simple cash-earning business, so the rest of the write-up is a study note, not a recommendation."
    : null;

  return { kickOut, kickOutReason, flags };
}

function createValueCopy(fundamentals: CompanyFundamentals): string {
  const intro = firstSentences(fundamentals.summary, 2);
  const industry = fundamentals.industry ?? fundamentals.sector;
  const who = industry
    ? `Customers show up because this is a ${industry.toLowerCase()} business.`
    : "Start with why a customer would pick this over the alternative.";

  if (intro) {
    return `${intro} ${who} The question to keep asking: what preference is this actually filling — speed, status, cost, reliability — and would you still pick it if a cheaper copy existed?`;
  }

  return `${who} Read the 10-K business section and keep asking why a customer comes here instead of a cheaper alternative.`;
}

function captureValueCopy(fundamentals: CompanyFundamentals): string {
  const op = fundamentals.operatingMargins;
  const profit = fundamentals.profitMargins;
  const fcf = fundamentals.freeCashflow;
  const revenue = fundamentals.totalRevenue;

  if (op != null && op >= 0.2) {
    return `This business keeps a fat slice of what it creates — operating margin ${pct(op)}${profit != null ? `, net ${pct(profit)}` : ""}. That is capture: not just selling something useful, but pricing so a real share of the value stays in the company.`;
  }
  if (op != null && op >= 0.08) {
    return `Capture is decent, not lush: operating margin ${pct(op)}${profit != null ? `, net ${pct(profit)}` : ""}. Enough to be a real business, not so wide that you can stop asking whether competition can nibble it.`;
  }
  if (op != null && op > 0) {
    return `Thin capture: operating margin only ${pct(op)}. The product may be useful, but the company is not keeping much of that usefulness as profit. A cheaper rival can make this uncomfortable fast.`;
  }
  if (revenue && revenue > 0) {
    return `The company sells ${money(revenue)} of product but is not capturing that as profit yet${fcf != null && fcf < 0 ? `, and free cash flow is ${money(fcf)}` : ""}. That is a harder investment: you have to believe the path to cash, not just the story.`;
  }
  return "How they make money is not obvious from this snapshot. Do not skip that step — monetization is half the thesis.";
}

function protectValueCopy(fundamentals: CompanyFundamentals): string {
  const op = fundamentals.operatingMargins ?? 0;
  const roe = fundamentals.returnOnEquity;
  const debt = fundamentals.debtToEquity ?? 0;

  if (op >= 0.15 && (roe == null || roe >= 0.15) && debt < 150) {
    return `Something is stopping copycats, even if we cannot name the moat from a filing extract: high returns (ROE ${roe != null ? pct(roe) : "n/a"}) with a clean-enough balance sheet. Pretend you know nothing about “network effects” and just ask: what would it take for a well-funded rival to do this exact thing?`;
  }
  if (op >= 0.08 && debt < 200) {
    return `Protection looks ordinary, not fortress-like. Returns are positive, but not so high that a competitor would be crazy to try. The burden is on you to find a first-principles reason they cannot be copied — switching costs, scale, a brand people refuse to leave — and to drop the name if you cannot.`;
  }
  return `Protection looks weak from the numbers: margins are thin or leverage is high. If anyone with capital could offer the same thing, this is not a compounder. Either find a real barrier in the 10-K, or pass.`;
}

function buildThesisParagraph(
  fundamentals: CompanyFundamentals,
  quality: BusinessQuality,
  implied: number | null,
  hurdle: number
): string {
  const name = fundamentals.name;
  const qualityBit =
    quality.grade === "Durable"
      ? `${name} looks like a business that creates value, keeps a real slice of it, and has some protection around that slice.`
      : quality.grade === "Fair"
        ? `${name} is a real business — profitable — but the moat is not obvious from the snapshot.`
        : quality.grade === "Speculative"
          ? `${name} is still proving it can capture value as cash. That is allowed, but it is not a plain-vanilla hold.`
          : `${name} does not yet look like a simple investment. Treat this as a study file, not a buy.`;

  if (implied == null) {
    return `${qualityBit} Valuation cannot be tied to cash flows yet, so there is no number that says “cheap.”`;
  }

  if (implied >= hurdle) {
    return `${qualityBit} On conservative growth the cash flows imply about ${pct(implied, 1)} a year versus a ${pct(hurdle, 1)} hurdle — attractive if those assumptions hold, without needing a clever one-off catalyst.`;
  }

  return `${qualityBit} The business can still be worth understanding, but at this price the same conservative cash flows only imply ${pct(implied, 1)} a year. That is not a reason to stretch.`;
}

function buildBearCase(fundamentals: CompanyFundamentals): string[] {
  const bears: string[] = [];

  if ((fundamentals.operatingMargins ?? 1) < 0.08) {
    bears.push(
      "A well-funded rival copies the offer and the thin margin disappears."
    );
  } else {
    bears.push(
      "The thing that looks like a moat is not one — eBay-style network effects that do not actually trap the customer."
    );
  }

  if ((fundamentals.freeCashflow ?? 1) <= 0) {
    bears.push(
      "Cash keeps going out the door (capex, stock-based pay, or a science project) and equity holders never see it."
    );
  } else {
    bears.push(
      "Management spends the cash flow on a low-return moonshot instead of the core business."
    );
  }

  if ((fundamentals.debtToEquity ?? 0) > 150) {
    bears.push("Leverage turns a normal downturn into an equity problem.");
  }

  if ((fundamentals.forwardPe ?? fundamentals.trailingPe ?? 0) > 35) {
    bears.push(
      "Growth comes in fine and the stock still goes nowhere because the multiple was doing all the work."
    );
  }

  if (fundamentals.revenueGrowth != null && fundamentals.revenueGrowth < 0) {
    bears.push("The revenue decline is not a dip — the product is being substituted.");
  }

  bears.push(
    "You do not actually understand why the customer shows up, so a narrative shift blindsides you."
  );

  return bears.slice(0, 4);
}

function yearsToMarketMultiple(
  forwardPe: number | null,
  growth: number
): number | null {
  if (forwardPe == null || !(forwardPe > 0) || growth <= 0) return null;
  if (forwardPe <= MARKET_FORWARD_PE) return 0;
  return Math.log(forwardPe / MARKET_FORWARD_PE) / Math.log(1 + growth);
}

function scaleValueToPrice(
  value: number,
  marketValue: number,
  currentPrice: number
): number | null {
  if (!(marketValue > 0) || !(currentPrice > 0) || !(value > 0)) return null;
  return currentPrice * (value / marketValue);
}

export interface ThesisBuildInput {
  fundamentals: CompanyFundamentals;
  quality: BusinessQuality;
  riskFreeRate: number;
  peers: ThesisPeer[];
}

export function buildInvestmentThesis(input: ThesisBuildInput): InvestmentThesis {
  const { fundamentals, quality, riskFreeRate, peers } = input;
  const screen = buildScreen(fundamentals);

  const hurdleRate = clamp(riskFreeRate + 0.08, 0.1, 0.15);
  const sellRate = clamp(riskFreeRate + 0.04, 0.07, 0.12);
  const growth = conservativeGrowth(
    fundamentals.revenueGrowth ?? fundamentals.earningsGrowth
  );

  let method: ThesisValuationMethod = "unavailable";
  let startingCashFlow: number | null = null;
  let marketValue: number | null = null;

  if (fundamentals.freeCashflow != null && fundamentals.freeCashflow > 0) {
    method = "fcf";
    startingCashFlow = fundamentals.freeCashflow;
    marketValue =
      fundamentals.enterpriseValue ?? fundamentals.marketCap ?? null;
  } else if (fundamentals.netIncome != null && fundamentals.netIncome > 0) {
    method = "earnings";
    startingCashFlow = fundamentals.netIncome;
    marketValue = fundamentals.marketCap;
  }

  const dcfInput =
    startingCashFlow != null && marketValue != null && marketValue > 0
      ? {
          startingCashFlow,
          marketValue,
          initialGrowth: growth,
          terminalGrowth: TERMINAL_GROWTH,
          years: FORECAST_YEARS,
        }
      : null;

  const implied = dcfInput ? impliedReturn(dcfInput) : null;
  const buyValue = dcfInput ? valueAtDiscountRate(dcfInput, hurdleRate) : null;
  const sellValue = dcfInput ? valueAtDiscountRate(dcfInput, sellRate) : null;
  const buyPrice =
    buyValue != null && marketValue
      ? scaleValueToPrice(buyValue, marketValue, fundamentals.currentPrice)
      : null;
  const sellPrice =
    sellValue != null && marketValue
      ? scaleValueToPrice(sellValue, marketValue, fundamentals.currentPrice)
      : null;

  const attractive =
    implied != null && implied >= hurdleRate && quality.grade !== "Pass";

  const years = yearsToMarketMultiple(fundamentals.forwardPe, growth);

  let stance: ThesisStance = "hold-study";
  if (quality.grade === "Pass" || screen.kickOut) {
    stance = "pass";
  } else if (method === "unavailable") {
    stance = quality.grade === "Durable" ? "hold-study" : "pass";
  } else if (attractive) {
    stance = "buy";
  } else if (implied != null && implied >= sellRate && quality.grade !== "Speculative") {
    stance = "wait";
  } else if (quality.grade === "Durable" || quality.grade === "Fair") {
    stance = "wait";
  } else {
    stance = "pass";
  }

  const planBuyAt =
    stance === "buy"
      ? fundamentals.currentPrice
      : stance === "wait"
        ? buyPrice
        : null;

  const whenToBuy =
    stance === "buy"
      ? `Now — conservative cash flows already imply about ${pct(implied ?? 0, 1)} a year, above the ${pct(hurdleRate, 1)} hurdle. You do not need a clever catalyst.`
      : stance === "wait"
        ? `Not at this price. Wait for about ${buyPrice != null ? `$${buyPrice.toFixed(2)}` : "a lower print"}, where the same cash-flow assumptions clear the ${pct(hurdleRate, 1)} hurdle.`
        : stance === "hold-study"
          ? "Do not start a position from this screen. Keep a file on the business so you know what a great company looks like if it ever sells off."
          : screen.kickOutReason ??
            "Pass. Spend the time on a business you can actually underwrite.";

  const whenToSell =
    method === "unavailable"
      ? "There is no cash-flow sell price yet. Exit if you cannot explain create / capture / protect in a paragraph, or if a bear-case item below starts looking true."
      : `This is a hold, not a five-day trade. Trim or sell when the price implies only a ${pct(sellRate, 1)} return${sellPrice != null ? ` (around $${sellPrice.toFixed(2)})` : ""}, or sooner if a bear-case thread starts looking true. Do not invent a more specific story just to feel smart — extra detail is extra ways to be wrong.`;

  const explanation =
    method === "unavailable"
      ? "No usable free cash flow or earnings to run a reverse DCF. That itself is information: you cannot tie a thesis to numbers yet."
      : method === "fcf"
        ? `Reverse DCF on trailing free cash flow ${money(startingCashFlow!)}, fading ${pct(growth, 1)} growth to ${pct(TERMINAL_GROWTH, 1)} over ${FORECAST_YEARS} years, solved against ${fundamentals.enterpriseValue ? "enterprise value" : "market cap"}. The implied return is what the market is already pricing. High return on conservative growth is attractive; the opposite is not.`
        : `Reverse DCF on trailing earnings ${money(startingCashFlow!)} (FCF was not positive), same fade to ${pct(TERMINAL_GROWTH, 1)}. Treated as owner earnings against market cap. Coarser than FCF, still better than a multiple with no model behind it.`;

  const extra =
    years != null && years > 3 && fundamentals.forwardPe != null
      ? ` Forward P/E ${fundamentals.forwardPe.toFixed(1)} would need more than three years of ${pct(growth, 1)} growth just to sag toward a market multiple — a stretch.`
      : "";

  return {
    symbol: fundamentals.symbol,
    name: fundamentals.name,
    currentPrice: fundamentals.currentPrice,
    currency: fundamentals.currency,
    sector: fundamentals.sector,
    industry: fundamentals.industry,
    summary: firstSentences(fundamentals.summary, 3),
    quality,
    screen,
    createValue: createValueCopy(fundamentals),
    captureValue: captureValueCopy(fundamentals),
    protectValue: protectValueCopy(fundamentals),
    thesis: buildThesisParagraph(fundamentals, quality, implied, hurdleRate),
    bearCase: buildBearCase(fundamentals),
    valuation: {
      method,
      startingCashFlow,
      conservativeGrowth: method === "unavailable" ? null : growth,
      impliedReturn: implied,
      hurdleRate,
      sellRate,
      riskFreeRate,
      attractive,
      buyPrice,
      sellPrice,
      forwardPe: fundamentals.forwardPe,
      yearsToMarketMultiple: years,
      explanation: explanation + extra,
    },
    plan: {
      stance,
      whenToBuy,
      buyAt: planBuyAt,
      whenToSell,
      sellAt: sellPrice,
    },
    peers,
    sources: [
      "Yahoo Finance quoteSummary (profile, financials, key statistics)",
      "Reverse DCF of trailing FCF or earnings, growth haircut 30%, fade to 2.5%",
      "Live Treasury yield for the hurdle (rf + 8%) and sell rate (rf + 4%)",
    ],
  };
}

async function loadPeers(symbol: string): Promise<ThesisPeer[]> {
  const group = peerSymbolsInUniverse(symbol, 4);
  if (!group) return [];

  const peers: ThesisPeer[] = await Promise.all(
    group.symbols.map(async (peerSymbol) => {
      try {
        const fundamentals = await fetchFundamentals(peerSymbol);
        const quality = scoreBusinessQuality(fundamentals);
        return {
          symbol: peerSymbol,
          name: fundamentals.name,
          grade: quality.grade,
          note:
            quality.grade === "Durable"
              ? `Another ${group.group.toLowerCase()} name that clears the business screen.`
              : quality.grade === "Pass" || quality.grade === "Speculative"
                ? `Same group, but ${quality.grade.toLowerCase()} — useful as a comparison, not a shortcut.`
                : `Same ${group.group.toLowerCase()} group. Compare create / capture / protect against the name you just researched.`,
        };
      } catch {
        return {
          symbol: peerSymbol,
          name: peerSymbol,
          grade: null,
          note: `Same ${group.group.toLowerCase()} group to study next.`,
        };
      }
    })
  );
  return peers;
}

export async function generateInvestmentThesis(
  symbol: string
): Promise<InvestmentThesis> {
  const upper = symbol.trim().toUpperCase();

  return cached(`thesis:${upper}`, TTL.quoteSummary, async () => {
    const [fundamentals, rateInfo] = await Promise.all([
      fetchFundamentals(upper),
      fetchRiskFreeRate(),
    ]);

    if (!fundamentals.currentPrice) {
      throw new Error(`No usable price for ${upper}`);
    }

    const quality = scoreBusinessQuality(fundamentals);
    const peers = await loadPeers(fundamentals.symbol);

    return buildInvestmentThesis({
      fundamentals,
      quality,
      riskFreeRate: rateInfo.rate,
      peers,
    });
  });
}
