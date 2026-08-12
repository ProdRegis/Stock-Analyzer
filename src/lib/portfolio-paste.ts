/**
 * Reading holdings out of pasted text.
 *
 * Runs entirely in the browser with no API call, which makes it both free and
 * more reliable than reading an image, since it works on real characters
 * rather than a guess at pixels. Accepts what an AI chat returns when given
 * the prompt below, what a spreadsheet copies, and what selecting a brokerage
 * table on a web page produces.
 */

import { buildImportResult, type ImportResult } from "./portfolio-import";

/** Given to ChatGPT or Claude along with a screenshot; its reply pastes in cleanly. */
export const AI_TRANSCRIPTION_PROMPT = `Read this screenshot of my stock portfolio and list every position.

Reply with ONLY a JSON object, no explanation, in exactly this shape:
{"holdings":[{"symbol":"AAPL","shares":12,"avgCost":178.40}]}

Rules:
- "symbol" is the ticker, uppercase. If only a company name is shown, use its ticker.
- "shares" is the number of shares held.
- "avgCost" is the average cost or purchase price of ONE share. Omit this field entirely if the screenshot does not show a per-share cost.
- Never divide a total value to invent a per-share cost.
- Do not include cash, crypto, options, or account totals.
- Omit any position you cannot read clearly rather than guessing.`;

const SYMBOL_TOKEN = /^[A-Z]{1,6}(?:[.-][A-Z]{1,2})?$/;

/** Rows whose first cell is one of these are column headers, not positions. */
const HEADER_WORDS = new Set([
  "symbol",
  "ticker",
  "stock",
  "name",
  "security",
  "position",
  "holding",
  "holdings",
  "instrument",
]);

interface RawRow {
  symbol: string;
  shares: number;
  avgCost?: number;
}

function stripNumericFormatting(token: string): string {
  // Handles "$1,234.56", "(12.5)" for negatives, and trailing units.
  return token.replace(/[$£€,\s]/g, "").replace(/[%x]$/i, "");
}

function asNumber(token: string): number | null {
  const cleaned = stripNumericFormatting(token);
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Pulls a ticker out of a line. A parenthesised symbol wins, since a row like
 * "Apple Inc (AAPL)" contains capitalised words that also look like tickers.
 */
function findSymbol(tokens: string[], line: string): string | null {
  const parenthesised = line.match(/\(([A-Za-z.\-]{1,8})\)/);
  if (parenthesised) {
    const candidate = parenthesised[1].toUpperCase();
    if (SYMBOL_TOKEN.test(candidate)) return candidate;
  }

  for (const token of tokens) {
    const candidate = token.replace(/[()]/g, "").toUpperCase();
    if (SYMBOL_TOKEN.test(candidate) && asNumber(token) === null) {
      return candidate;
    }
  }

  return null;
}

/**
 * Splits one CSV row, keeping commas that sit inside quotes. Exports write
 * "612,345.67" quoted precisely because the comma is digit grouping rather
 * than a column break.
 */
function splitCsv(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      // A doubled quote inside a quoted field is an escaped literal quote.
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

/**
 * True when at least one comma is a column break rather than digit grouping.
 *
 * Grouping only ever appears between two digits, so "BRK.A 2 $612,345.67" is
 * space-delimited while "AAPL,12,178.40" is not. Deciding once per line beats
 * guessing per comma, which cannot tell those two apart.
 */
function hasColumnComma(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== ",") continue;

    const before = line[i - 1] ?? "";
    const after = line[i + 1] ?? "";
    if (!/\d/.test(before) || !/\d/.test(after)) return true;
  }

  return false;
}

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (hasColumnComma(line)) return splitCsv(line);
  return line.split(/\s+/);
}

function parseLine(line: string): RawRow | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;

  const tokens = splitLine(trimmed)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return null;

  const first = tokens[0].replace(/[^a-z]/gi, "").toLowerCase();
  if (HEADER_WORDS.has(first)) return null;

  const symbol = findSymbol(tokens, trimmed);
  if (symbol === null) return null;

  const numbers: number[] = [];
  for (const token of tokens) {
    if (token.replace(/[()]/g, "").toUpperCase() === symbol) continue;
    const value = asNumber(token);
    if (value !== null) numbers.push(value);
  }

  if (numbers.length === 0) return null;

  // Column order is symbol, shares, average cost. Anything further along is
  // market value or day change, which the app recomputes itself.
  const [shares, avgCost] = numbers;

  return {
    symbol,
    shares,
    avgCost: avgCost != null && avgCost > 0 ? avgCost : undefined,
  };
}

/** Accepts the AI JSON reply, CSV, TSV, or a table copied off a web page. */
export function parsePastedHoldings(text: string): ImportResult {
  const trimmed = text.trim();

  if (trimmed === "") {
    return { holdings: [], warnings: ["Paste your holdings above to continue."] };
  }

  const emptyMessage =
    "Nothing recognisable in that text. Each line needs a ticker and a share count.";

  // An AI reply or a copied JSON blob is the most precise input, so try it
  // first and only fall back to line parsing when it is not JSON.
  const json = tryParseJson(trimmed);
  if (json !== null) {
    const candidates = Array.isArray(json)
      ? json
      : (json as Record<string, unknown>).holdings;

    if (Array.isArray(candidates)) {
      return buildImportResult(candidates, emptyMessage);
    }
  }

  const rows = trimmed
    .split(/\r?\n/)
    .map(parseLine)
    .filter((row): row is RawRow => row !== null);

  return buildImportResult(rows, emptyMessage);
}

function tryParseJson(text: string): unknown {
  // Tolerates a fenced code block, which is how chat replies usually arrive.
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  if (!unfenced.startsWith("{") && !unfenced.startsWith("[")) return null;

  try {
    return JSON.parse(unfenced);
  } catch {
    return null;
  }
}
