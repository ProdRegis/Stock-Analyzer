import { inflateRawSync } from "node:zlib";
import { TTL, cached } from "./cache";
import { edgarUserAgent } from "./edgar-headers";
import { congressFilerId } from "./thirteen-f-filers";
import type { CongressFilerReport, CongressPtrFiling, ThirteenFSearchHit } from "./types";

const CLERK = "https://disclosures-clerk.house.gov";
const INDEX_YEARS = [2026, 2025] as const;

async function clerkFetch(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": edgarUserAgent(),
      Accept: "application/zip, application/octet-stream, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) {
    throw new Error(`House Clerk request failed (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Read a named file out of a ZIP that uses stored or deflate compression.
 * House Clerk yearly indexes are small two-file archives of this shape.
 */
export function unzipNamedFile(
  zip: Buffer,
  matchName: (name: string) => boolean
): Buffer {
  let offset = 0;
  while (offset + 30 <= zip.length) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) break;
    const method = zip.readUInt16LE(offset + 8);
    const compSize = zip.readUInt32LE(offset + 18);
    const nameLen = zip.readUInt16LE(offset + 26);
    const extraLen = zip.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = zip.subarray(nameStart, nameStart + nameLen).toString("utf8");
    const dataStart = nameStart + nameLen + extraLen;
    const data = zip.subarray(dataStart, dataStart + compSize);

    if (matchName(name)) {
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported ZIP compression ${method} for ${name}`);
    }

    offset = dataStart + compSize;
  }

  throw new Error("Named file not found in ZIP");
}

export interface HouseIndexRow {
  prefix: string;
  last: string;
  first: string;
  suffix: string;
  filingType: string;
  district: string;
  year: string;
  filingDate: string;
  docId: string;
}

function toIsoDate(mdy: string): string {
  const [month, day, year] = mdy.split("/");
  if (!month || !day || !year) return mdy;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseHouseIndexTsv(text: string): HouseIndexRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: HouseIndexRow[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 9) continue;
    rows.push({
      prefix: cols[0]?.trim() ?? "",
      last: cols[1]?.trim() ?? "",
      first: cols[2]?.trim() ?? "",
      suffix: cols[3]?.trim() ?? "",
      filingType: cols[4]?.trim() ?? "",
      district: cols[5]?.trim() ?? "",
      year: cols[6]?.trim() ?? "",
      filingDate: toIsoDate(cols[7]?.trim() ?? ""),
      docId: cols[8]?.trim() ?? "",
    });
  }

  return rows;
}

function ptrPdfUrl(year: string, docId: string): string {
  return `${CLERK}/public_disc/ptr-pdfs/${year}/${docId}.pdf`;
}

function displayName(row: HouseIndexRow): string {
  return `${row.first} ${row.last}`.replace(/\s+/g, " ").trim();
}

async function loadYearIndex(year: number): Promise<HouseIndexRow[]> {
  return cached(`house-ptr-index:${year}`, TTL.thirteenF, async () => {
    const zip = await clerkFetch(
      `${CLERK}/public_disc/financial-pdfs/${year}FD.ZIP`
    );
    const txt = unzipNamedFile(zip, (name) =>
      name.toLowerCase().endsWith(".txt")
    ).toString("utf8");
    return parseHouseIndexTsv(txt);
  });
}

async function loadHouseIndex(): Promise<HouseIndexRow[]> {
  const yearly = await Promise.all(
    INDEX_YEARS.map(async (year) => {
      try {
        return await loadYearIndex(year);
      } catch {
        return [] as HouseIndexRow[];
      }
    })
  );
  return yearly.flat();
}

export function matchHouseMembers(
  rows: HouseIndexRow[],
  query: string
): ThirteenFSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];

  const seen = new Set<string>();
  const hits: ThirteenFSearchHit[] = [];

  for (const row of rows) {
    if (row.filingType !== "P") continue;
    const full = displayName(row).toLowerCase();
    const last = row.last.toLowerCase();
    const first = row.first.toLowerCase();
    const matched =
      full.includes(needle) ||
      last.startsWith(needle) ||
      first.startsWith(needle) ||
      `${first} ${last}`.startsWith(needle);

    if (!matched) continue;
    const cik = congressFilerId(row.last, row.first);
    if (seen.has(cik)) continue;
    seen.add(cik);
    hits.push({
      cik,
      name: `${row.district} · House STOCK Act`,
      person: displayName(row),
      source: "congress",
      kind: "congress",
    });
    if (hits.length >= 8) break;
  }

  return hits;
}

export async function searchHousePtrFilers(
  query: string
): Promise<ThirteenFSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const rows = await loadHouseIndex();
    return matchHouseMembers(rows, trimmed);
  } catch {
    return [];
  }
}

export async function loadCongressPtrReport(
  last: string,
  first: string
): Promise<CongressFilerReport> {
  const rows = await loadHouseIndex();
  const lastNeedle = last.trim().toLowerCase();
  const firstNeedle = first.trim().toLowerCase();

  const matched = rows.filter(
    (row) =>
      row.last.toLowerCase() === lastNeedle &&
      row.first.toLowerCase().startsWith(firstNeedle)
  );

  if (matched.length === 0) {
    throw new Error(
      `No House STOCK Act filings found for ${first} ${last}. Members of Congress file Periodic Transaction Reports with the Clerk of the House, not Form 13F.`
    );
  }

  const ptrs = matched
    .filter((row) => row.filingType === "P" && row.docId)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));

  const filings: CongressPtrFiling[] = (ptrs.length > 0 ? ptrs : matched)
    .slice(0, 40)
    .map((row) => ({
      filingDate: row.filingDate,
      year: row.year,
      docId: row.docId,
      filingType: row.filingType === "P" ? "Periodic transaction report" : row.filingType,
      district: row.district,
      pdfUrl: ptrPdfUrl(row.year, row.docId),
    }));

  const sample = matched[0];

  return {
    kind: "congress",
    person: displayName(sample),
    filerName: "U.S. House — STOCK Act periodic transaction reports",
    district: sample.district || null,
    filings,
    sourceUrl: `${CLERK}/FinancialDisclosure`,
  };
}
