import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  matchHouseMembers,
  parseHouseIndexTsv,
  unzipNamedFile,
} from "./house-ptr";
import { matchNotableInvestors } from "./thirteen-f-filers";

function zipWithText(name: string, body: string): Buffer {
  const payload = Buffer.from(body, "utf8");
  const compressed = deflateRawSync(payload);
  const nameBuf = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(payload.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuf, compressed]);
}

describe("unzipNamedFile", () => {
  it("inflates a deflated ZIP entry by name suffix", () => {
    const zip = zipWithText("2026FD.txt", "hello zip");
    expect(unzipNamedFile(zip, (name) => name.endsWith(".txt")).toString()).toBe(
      "hello zip"
    );
  });
});

describe("parseHouseIndexTsv", () => {
  it("reads Clerk index rows and ISO-dates them", () => {
    const rows = parseHouseIndexTsv(
      "Prefix\tLast\tFirst\tSuffix\tFilingType\tStateDst\tYear\tFilingDate\tDocID\n" +
        "Hon.\tPelosi\tNancy\t\tP\tCA11\t2026\t6/23/2026\t20034836\n"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].last).toBe("Pelosi");
    expect(rows[0].filingDate).toBe("2026-06-23");
    expect(rows[0].docId).toBe("20034836");
  });
});

describe("matchHouseMembers", () => {
  it("finds Pelosi from a first-name query", () => {
    const hits = matchHouseMembers(
      [
        {
          prefix: "Hon.",
          last: "Pelosi",
          first: "Nancy",
          suffix: "",
          filingType: "P",
          district: "CA11",
          year: "2026",
          filingDate: "2026-06-23",
          docId: "20034836",
        },
      ],
      "nancy"
    );
    expect(hits[0]?.person).toBe("Nancy Pelosi");
    expect(hits[0]?.cik).toBe("congress:Pelosi:Nancy");
  });
});

describe("matchNotableInvestors", () => {
  it("suggests Nancy Pelosi when the user types nancy", () => {
    const hits = matchNotableInvestors("nancy");
    expect(hits[0]?.person).toBe("Nancy Pelosi");
    expect(hits[0]?.kind).toBe("congress");
  });

  it("returns the full notable list on an empty query for the dropdown", () => {
    expect(matchNotableInvestors("").length).toBeGreaterThan(10);
  });
});
