import { TTL, cached } from "./cache";
import { edgarHeaders } from "./edgar-headers";
import { searchHousePtrFilers } from "./house-ptr";
import {
  NOTABLE_INVESTORS,
  matchNotableInvestors,
  padCik,
} from "./thirteen-f-filers";
import type {
  ThirteenFFilerReport,
  ThirteenFHolding,
  ThirteenFPeriod,
  ThirteenFSearchHit,
  ThirteenFTrade,
} from "./types";

export { matchNotableInvestors, padCik, NOTABLE_INVESTORS };

const SEC_JSON = "https://data.sec.gov";
const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data";
const SEC_EFTS = "https://efts.sec.gov/LATEST/search-index";

/** 13F Column 4 is reported in thousands of dollars. */
export const VALUE_THOUSANDS = 1_000;

/** Citadel-scale books are thousands of rows; the UI only needs the top slice. */
export const THIRTEEN_F_DISPLAY_LIMIT = 50;

const INFO_TABLE_RE =
  /<(?:[\w.]+:)?infoTable\b[^>]*>([\s\S]*?)<\/(?:[\w.]+:)?infoTable>/gi;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlField(block: string, tag: string): string {
  const match = new RegExp(
    `<(?:[\\w.]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.]+:)?${tag}>`,
    "i"
  ).exec(block);
  return match ? decodeXml(match[1]) : "";
}

function xmlNumber(block: string, tag: string): number {
  const raw = xmlField(block, tag).replace(/,/g, "");
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function holdingKey(holding: {
  cusip: string;
  putCall: string | null;
}): string {
  return `${holding.cusip}|${holding.putCall ?? "SH"}`;
}

export function parseThirteenFHoldings(xml: string): ThirteenFHolding[] {
  INFO_TABLE_RE.lastIndex = 0;
  const merged = new Map<
    string,
    Omit<ThirteenFHolding, "weight">
  >();

  for (const match of xml.matchAll(INFO_TABLE_RE)) {
    const block = match[1];
    const cusip = xmlField(block, "cusip").replace(/\s/g, "").toUpperCase();
    if (cusip.length < 6) continue;

    const putCallRaw = xmlField(block, "putCall").toLowerCase();
    const putCall =
      putCallRaw === "put" || putCallRaw === "call" ? putCallRaw : null;
    const valueThousands = xmlNumber(block, "value");
    const shares = xmlNumber(block, "sshPrnamt");
    const row = {
      issuer: xmlField(block, "nameOfIssuer") || "Unknown issuer",
      titleOfClass: xmlField(block, "titleOfClass"),
      cusip,
      valueUsd: valueThousands * VALUE_THOUSANDS,
      shares,
      shareType: xmlField(block, "sshPrnamtType") || "SH",
      putCall,
    };
    const key = holdingKey(row);
    const existing = merged.get(key);
    if (existing) {
      existing.valueUsd += row.valueUsd;
      existing.shares += row.shares;
    } else {
      merged.set(key, row);
    }
  }

  const rows = [...merged.values()];
  const total = rows.reduce((sum, row) => sum + row.valueUsd, 0);

  return rows
    .map((row) => ({
      ...row,
      weight: total > 0 ? row.valueUsd / total : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
}

export function diffThirteenFHoldings(
  current: ThirteenFHolding[],
  previous: ThirteenFHolding[]
): ThirteenFTrade[] {
  const before = new Map(previous.map((row) => [holdingKey(row), row]));
  const after = new Map(current.map((row) => [holdingKey(row), row]));
  const trades: ThirteenFTrade[] = [];

  for (const [key, now] of after) {
    const was = before.get(key);
    if (!was) {
      trades.push({
        action: "opened",
        issuer: now.issuer,
        cusip: now.cusip,
        putCall: now.putCall,
        sharesBefore: 0,
        sharesAfter: now.shares,
        valueUsdBefore: 0,
        valueUsdAfter: now.valueUsd,
        shareChange: now.shares,
        valueChangeUsd: now.valueUsd,
      });
      continue;
    }
    if (now.shares === was.shares) continue;
    trades.push({
      action: now.shares > was.shares ? "added" : "reduced",
      issuer: now.issuer,
      cusip: now.cusip,
      putCall: now.putCall,
      sharesBefore: was.shares,
      sharesAfter: now.shares,
      valueUsdBefore: was.valueUsd,
      valueUsdAfter: now.valueUsd,
      shareChange: now.shares - was.shares,
      valueChangeUsd: now.valueUsd - was.valueUsd,
    });
  }

  for (const [key, was] of before) {
    if (after.has(key)) continue;
    trades.push({
      action: "exited",
      issuer: was.issuer,
      cusip: was.cusip,
      putCall: was.putCall,
      sharesBefore: was.shares,
      sharesAfter: 0,
      valueUsdBefore: was.valueUsd,
      valueUsdAfter: 0,
      shareChange: -was.shares,
      valueChangeUsd: -was.valueUsd,
    });
  }

  return trades.sort(
    (a, b) => Math.abs(b.valueChangeUsd) - Math.abs(a.valueChangeUsd)
  );
}

/** Keep totals for the whole book, but only send the top slice to the client. */
export function presentThirteenFBook(
  holdings: ThirteenFHolding[],
  trades: ThirteenFTrade[],
  limit = THIRTEEN_F_DISPLAY_LIMIT
): Pick<
  ThirteenFFilerReport,
  "holdingCount" | "tradeCount" | "holdings" | "trades"
> {
  return {
    holdingCount: holdings.length,
    tradeCount: trades.length,
    holdings: holdings.slice(0, limit),
    trades: trades.slice(0, limit),
  };
}

let lastSecCall = 0;

async function secFetch(url: string): Promise<Response> {
  const wait = 120 - (Date.now() - lastSecCall);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastSecCall = Date.now();

  const response = await fetch(url, {
    headers: edgarHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `SEC EDGAR returned ${response.status} for ${url}. ${
        response.status === 403
          ? "EDGAR is blocking this server. Retry in a minute; if it keeps failing, the SEC is refusing this hosting IP."
          : "Try again in a moment."
      }`
    );
  }

  return response;
}

interface SubmissionsJson {
  name?: string;
  filings?: {
    recent?: {
      form?: string[];
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      primaryDocument?: string[];
    };
  };
}

interface ArchiveIndex {
  directory?: {
    item?: Array<{ name?: string; type?: string }> | { name?: string; type?: string };
  };
}

function hasInfoTable(xml: string): boolean {
  INFO_TABLE_RE.lastIndex = 0;
  const found = INFO_TABLE_RE.test(xml);
  INFO_TABLE_RE.lastIndex = 0;
  return found;
}

function asItems(
  value:
    | Array<{ name?: string; type?: string }>
    | { name?: string; type?: string }
    | undefined
): Array<{ name?: string; type?: string }> {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function accessionPath(accession: string): string {
  return accession.replace(/-/g, "");
}

function cikPath(cik: string): string {
  return String(Number(padCik(cik)));
}

function pickLatestPerPeriod(
  rows: ThirteenFPeriod[]
): ThirteenFPeriod[] {
  const byPeriod = new Map<string, ThirteenFPeriod>();
  for (const row of rows) {
    const key = row.reportDate || row.filingDate;
    const existing = byPeriod.get(key);
    if (!existing || row.filingDate > existing.filingDate) {
      byPeriod.set(key, row);
    }
  }
  return [...byPeriod.values()].sort((a, b) =>
    (b.reportDate || b.filingDate).localeCompare(a.reportDate || a.filingDate)
  );
}

function periodsFromSubmissions(
  cik: string,
  recent: NonNullable<NonNullable<SubmissionsJson["filings"]>["recent"]>
): ThirteenFPeriod[] {
  const forms = recent.form ?? [];
  const rows: ThirteenFPeriod[] = [];

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i] ?? "";
    if (form !== "13F-HR" && form !== "13F-HR/A") continue;
    const accession = recent.accessionNumber?.[i];
    if (!accession) continue;
    const filingDate = recent.filingDate?.[i] ?? "";
    const reportDate = recent.reportDate?.[i] ?? filingDate;
    rows.push({
      reportDate,
      filingDate,
      accession,
      form,
      documentUrl: `${SEC_ARCHIVES}/${cikPath(cik)}/${accessionPath(accession)}/`,
    });
  }

  return pickLatestPerPeriod(rows);
}

async function loadInfoTableXml(period: ThirteenFPeriod): Promise<string> {
  const indexUrl = `${period.documentUrl}index.json`;
  const index = (await (await secFetch(indexUrl)).json()) as ArchiveIndex;
  const files = asItems(index.directory?.item);
  const xmlFiles = files.filter((file) =>
    (file.name ?? "").toLowerCase().endsWith(".xml")
  );

  const preferred = [
    ...xmlFiles.filter((file) =>
      /info|13f|holding/i.test(`${file.name} ${file.type}`)
    ),
    ...xmlFiles,
  ];

  const seen = new Set<string>();
  for (const file of preferred) {
    const name = file.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const xml = await (await secFetch(`${period.documentUrl}${name}`)).text();
    if (hasInfoTable(xml)) {
      return xml;
    }
  }

  throw new Error(
    `No 13F information table XML in ${period.accession}. The filing may be a notice (13F-NT) or still processing.`
  );
}

export async function loadThirteenFReport(
  cikInput: string
): Promise<ThirteenFFilerReport> {
  const cik = padCik(cikInput);
  if (!/^\d{10}$/.test(cik) || cik === "0000000000") {
    throw new Error("That does not look like an SEC CIK.");
  }

  return cached(`13f:${cik}`, TTL.thirteenF, async () => {
    const submissions = (await (
      await secFetch(`${SEC_JSON}/submissions/CIK${cik}.json`)
    ).json()) as SubmissionsJson;

    const periods = periodsFromSubmissions(
      cik,
      submissions.filings?.recent ?? {}
    );
    if (periods.length === 0) {
      throw new Error(
        `${submissions.name ?? cik} has no Form 13F-HR on file. 13F is only for US managers with at least $100M in qualifying securities.`
      );
    }

    const currentPeriod = periods[0];
    const previousPeriod = periods[1] ?? null;
    const currentXml = await loadInfoTableXml(currentPeriod);
    const holdings = parseThirteenFHoldings(currentXml);
    if (holdings.length === 0) {
      throw new Error("The latest 13F information table had no holdings.");
    }

    let trades: ThirteenFTrade[] = [];
    if (previousPeriod) {
      try {
        const previousXml = await loadInfoTableXml(previousPeriod);
        trades = diffThirteenFHoldings(
          holdings,
          parseThirteenFHoldings(previousXml)
        );
      } catch {
        trades = [];
      }
    }

    const notable = NOTABLE_INVESTORS.find((investor) => investor.cik === cik);

    return {
      cik,
      filerName: notable?.filerName ?? submissions.name ?? cik,
      person: notable?.person ?? null,
      period: currentPeriod,
      previousPeriod,
      totalValueUsd: holdings.reduce((sum, row) => sum + row.valueUsd, 0),
      ...presentThirteenFBook(holdings, trades),
      sourceUrl: currentPeriod.documentUrl,
    };
  });
}

interface EftsHit {
  _source?: {
    display_names?: string[];
    entity_name?: string;
    ciks?: string[];
  };
}

function nameFromHit(hit: EftsHit): string {
  const display = hit._source?.display_names?.[0];
  if (display) {
    return display.replace(/\s*\(CIK\s*\d+\)\s*$/i, "").trim();
  }
  return hit._source?.entity_name?.trim() || "Unknown filer";
}

export async function searchThirteenFFilers(
  query: string
): Promise<ThirteenFSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return cached(
    `13f-search:${trimmed.toLowerCase()}`,
    TTL.thirteenFSearch,
    async () => {
      const notableHits: ThirteenFSearchHit[] = matchNotableInvestors(
        trimmed
      ).map((investor) => ({
        cik: investor.cik,
        name: investor.filerName,
        person: investor.person,
        source: investor.kind === "congress" ? "congress" : "notable",
        kind: investor.kind === "congress" ? "congress" : "13f",
      }));

      const digits = trimmed.replace(/\D/g, "");
      if (/^\d{6,10}$/.test(digits)) {
        const cik = padCik(digits);
        if (!notableHits.some((hit) => hit.cik === cik)) {
          notableHits.unshift({
            cik,
            name: `CIK ${cik}`,
            person: null,
            source: "edgar",
          });
        }
      }

      try {
        const url = `${SEC_EFTS}?${new URLSearchParams({
          q: trimmed,
          forms: "13F-HR",
          dateRange: "custom",
          startdt: "2023-01-01",
        }).toString()}`;
        const payload = (await (await secFetch(url)).json()) as {
          hits?: { hits?: EftsHit[] };
        };
        const seen = new Set(notableHits.map((hit) => hit.cik));

        for (const hit of payload.hits?.hits ?? []) {
          const cik = padCik(hit._source?.ciks?.[0] ?? "");
          if (!/^\d{10}$/.test(cik) || seen.has(cik)) continue;
          seen.add(cik);
          notableHits.push({
            cik,
            name: nameFromHit(hit),
            person: null,
            source: "edgar",
          });
          if (notableHits.length >= 12) break;
        }
      } catch {
        // Curated matches still return if EDGAR search is down.
      }

      try {
        for (const hit of await searchHousePtrFilers(trimmed)) {
          if (notableHits.some((existing) => existing.cik === hit.cik)) continue;
          notableHits.push(hit);
          if (notableHits.length >= 12) break;
        }
      } catch {
        // House Clerk is optional; notables still return.
      }

      return notableHits.slice(0, 12);
    }
  );
}
