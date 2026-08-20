import { describe, expect, it } from "vitest";
import { matchNotableInvestors, padCik } from "./thirteen-f-filers";
import {
  presentThirteenFBook,
  diffThirteenFHoldings,
  holdingKey,
  parseThirteenFHoldings,
} from "./thirteen-f";

const SAMPLE = `<?xml version="1.0"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>70000000</value>
    <shrsOrPrnAmt>
      <sshPrnamt>1000000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>5000000</value>
    <shrsOrPrnAmt>
      <sshPrnamt>50000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>AMAZON COM INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>023135106</cusip>
    <value>20000000</value>
    <shrsOrPrnAmt>
      <sshPrnamt>200000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>AMAZON COM INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>023135106</cusip>
    <value>1000000</value>
    <shrsOrPrnAmt>
      <sshPrnamt>10000</sshPrnamt>
      <sshPrnamtType>SH</sshPrnamtType>
    </shrsOrPrnAmt>
    <putCall>Put</putCall>
  </infoTable>
</informationTable>`;

const NAMESPACED = `
<ns1:infoTable>
  <ns1:nameOfIssuer>BANK OF AMERICA CORP</ns1:nameOfIssuer>
  <ns1:titleOfClass>COM</ns1:titleOfClass>
  <ns1:cusip>060505104</ns1:cusip>
  <ns1:value>317</ns1:value>
  <ns1:shrsOrPrnAmt>
    <ns1:sshPrnamt>1000</ns1:sshPrnamt>
    <ns1:sshPrnamtType>SH</ns1:sshPrnamtType>
  </ns1:shrsOrPrnAmt>
</ns1:infoTable>`;

describe("padCik", () => {
  it("zero-pads to ten digits", () => {
    expect(padCik("1067983")).toBe("0001067983");
    expect(padCik("0001067983")).toBe("0001067983");
  });
});

describe("matchNotableInvestors", () => {
  it("finds Buffett through the Berkshire filer, not a personal CIK", () => {
    const hits = matchNotableInvestors("buffett");
    expect(hits[0]?.cik).toBe("0001067983");
    expect(hits[0]?.person).toBe("Warren Buffett");
  });

  it("matches a CIK pasted with or without leading zeros", () => {
    expect(matchNotableInvestors("1336528")[0]?.person).toBe("Bill Ackman");
  });

  it("suggests Nancy Pelosi from nancy — she does not file 13F", () => {
    const hits = matchNotableInvestors("nancy");
    expect(hits.some((hit) => hit.person === "Nancy Pelosi")).toBe(true);
  });
});

describe("parseThirteenFHoldings", () => {
  it("merges duplicate CUSIPs, keeps puts separate, and converts thousands to dollars", () => {
    const holdings = parseThirteenFHoldings(SAMPLE);
    const apple = holdings.find((row) => row.cusip === "037833100" && !row.putCall);
    const amazon = holdings.find((row) => row.cusip === "023135106" && !row.putCall);
    const amazonPut = holdings.find((row) => row.putCall === "put");

    expect(apple?.shares).toBe(1_050_000);
    expect(apple?.valueUsd).toBe(75_000_000_000);
    expect(amazon?.valueUsd).toBe(20_000_000_000);
    expect(amazonPut?.shares).toBe(10_000);
    expect(apple!.weight).toBeGreaterThan(amazon!.weight);
    expect(holdings[0].cusip).toBe("037833100");
  });

  it("reads namespaced 13F XML", () => {
    const holdings = parseThirteenFHoldings(NAMESPACED);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].issuer).toBe("BANK OF AMERICA CORP");
    expect(holdings[0].valueUsd).toBe(317_000);
  });
});

describe("diffThirteenFHoldings", () => {
  it("labels opens, adds, cuts, and exits from share changes", () => {
    const previous = parseThirteenFHoldings(SAMPLE);
    const current = parseThirteenFHoldings(`
      <infoTable>
        <nameOfIssuer>APPLE INC</nameOfIssuer>
        <cusip>037833100</cusip>
        <value>80000000</value>
        <shrsOrPrnAmt><sshPrnamt>1200000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
      </infoTable>
      <infoTable>
        <nameOfIssuer>MICROSOFT CORP</nameOfIssuer>
        <cusip>594918104</cusip>
        <value>10000000</value>
        <shrsOrPrnAmt><sshPrnamt>50000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
      </infoTable>
    `);

    const trades = diffThirteenFHoldings(current, previous);
    const byCusip = Object.fromEntries(trades.map((trade) => [trade.cusip, trade]));

    expect(byCusip["037833100"].action).toBe("added");
    expect(byCusip["594918104"].action).toBe("opened");
    expect(byCusip["023135106"].action).toBe("exited");
    expect(holdingKey({ cusip: "023135106", putCall: "put" })).toBe(
      "023135106|put"
    );
    expect(trades.find((trade) => trade.putCall === "put")?.action).toBe(
      "exited"
    );
  });
});

describe("presentThirteenFBook", () => {
  it("keeps full counts while returning only the top slice", () => {
    const holdings = Array.from({ length: 80 }, (_, index) => ({
      issuer: `Name ${index}`,
      titleOfClass: "COM",
      cusip: String(index).padStart(9, "0"),
      valueUsd: 80 - index,
      shares: 1,
      shareType: "SH",
      putCall: null,
      weight: 0,
    }));
    const trades = holdings.map((row) => ({
      action: "opened" as const,
      issuer: row.issuer,
      cusip: row.cusip,
      putCall: null,
      sharesBefore: 0,
      sharesAfter: 1,
      valueUsdBefore: 0,
      valueUsdAfter: row.valueUsd,
      shareChange: 1,
      valueChangeUsd: row.valueUsd,
    }));

    const presented = presentThirteenFBook(holdings, trades);

    expect(presented.holdingCount).toBe(80);
    expect(presented.tradeCount).toBe(80);
    expect(presented.holdings).toHaveLength(50);
    expect(presented.trades).toHaveLength(50);
    expect(presented.holdings[0].issuer).toBe("Name 0");
  });
});
