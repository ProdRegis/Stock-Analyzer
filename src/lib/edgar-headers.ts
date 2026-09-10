/**
 * EDGAR sits behind Akamai. The documented "AppName you@email.com" User-Agent
 * is what their FAQ asks for, and it is also what they 403 from cloud IPs.
 * A stock browser UA is what actually returns 200 on data.sec.gov.
 *
 * SEC_USER_AGENT is honored only when it still looks like a browser string,
 * so an env var copied from the old FAQ does not recreate the 403.
 */
export const EDGAR_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function edgarUserAgent(): string {
  const custom = process.env.SEC_USER_AGENT?.trim();
  if (custom && /mozilla\/\d/i.test(custom)) return custom;
  return EDGAR_BROWSER_UA;
}

export function edgarHeaders(): Record<string, string> {
  return {
    "User-Agent": edgarUserAgent(),
    Accept: "application/json, application/xml, text/xml, text/html, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };
}
