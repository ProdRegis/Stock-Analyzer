import { afterEach, describe, expect, it } from "vitest";
import { EDGAR_BROWSER_UA, edgarUserAgent } from "./edgar-headers";

const original = process.env.SEC_USER_AGENT;

afterEach(() => {
  if (original === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = original;
});

describe("edgarUserAgent", () => {
  it("defaults to a browser string Akamai will accept", () => {
    delete process.env.SEC_USER_AGENT;
    expect(edgarUserAgent()).toBe(EDGAR_BROWSER_UA);
    expect(edgarUserAgent().startsWith("Mozilla/")).toBe(true);
  });

  it("ignores a FAQ-style AppName email User-Agent that EDGAR 403s", () => {
    process.env.SEC_USER_AGENT = "Stock Analyzer me@example.com";
    expect(edgarUserAgent()).toBe(EDGAR_BROWSER_UA);
  });

  it("honors an override that still looks like a browser", () => {
    process.env.SEC_USER_AGENT =
      "Mozilla/5.0 (compatible; TestSuite/1.0) AppleWebKit/537.36";
    expect(edgarUserAgent()).toContain("TestSuite/1.0");
  });
});
