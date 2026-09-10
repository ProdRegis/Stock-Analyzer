import { describe, expect, it } from "vitest";
import {
  decideAccess,
  parseBasicCredentials,
  secureCompare,
} from "./site-auth";

function basic(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

describe("secureCompare", () => {
  it("accepts identical strings", () => {
    expect(secureCompare("hunter2", "hunter2")).toBe(true);
  });

  it("rejects different strings of the same length", () => {
    expect(secureCompare("hunter2", "hunter3")).toBe(false);
  });

  it("rejects strings of different lengths", () => {
    expect(secureCompare("hunter", "hunter2")).toBe(false);
  });

  it("rejects an empty guess", () => {
    expect(secureCompare("", "hunter2")).toBe(false);
  });

  it("treats two empty strings as equal", () => {
    expect(secureCompare("", "")).toBe(true);
  });
});

describe("parseBasicCredentials", () => {
  it("decodes a well-formed header", () => {
    expect(parseBasicCredentials(basic("alice", "s3cret"))).toEqual({
      username: "alice",
      password: "s3cret",
    });
  });

  it("keeps colons that appear inside the password", () => {
    expect(parseBasicCredentials(basic("alice", "a:b:c"))).toEqual({
      username: "alice",
      password: "a:b:c",
    });
  });

  it("accepts an empty username", () => {
    expect(parseBasicCredentials(basic("", "s3cret"))).toEqual({
      username: "",
      password: "s3cret",
    });
  });

  it("is case-insensitive about the scheme", () => {
    const header = basic("alice", "s3cret").replace("Basic", "basic");
    expect(parseBasicCredentials(header)).not.toBeNull();
  });

  it("returns null for a missing or malformed header", () => {
    expect(parseBasicCredentials(null)).toBeNull();
    expect(parseBasicCredentials("")).toBeNull();
    expect(parseBasicCredentials("Bearer abc123")).toBeNull();
    expect(parseBasicCredentials("Basic")).toBeNull();
    expect(parseBasicCredentials("Basic !!!not-base64!!!")).toBeNull();
  });

  it("returns null when the decoded value has no colon", () => {
    expect(parseBasicCredentials(`Basic ${btoa("nocolon")}`)).toBeNull();
  });
});

describe("decideAccess", () => {
  const base = {
    expectedPassword: "s3cret",
    isProduction: true,
  };

  it("allows a correct password", () => {
    expect(
      decideAccess({
        ...base,
        authorizationHeader: basic("anyone", "s3cret"),
      })
    ).toEqual({ type: "allow" });
  });

  it("challenges a wrong password", () => {
    expect(
      decideAccess({
        ...base,
        authorizationHeader: basic("anyone", "wrong"),
      })
    ).toEqual({ type: "challenge" });
  });

  it("challenges a request with no credentials", () => {
    expect(
      decideAccess({ ...base, authorizationHeader: null })
    ).toEqual({ type: "challenge" });
  });

  it("ignores the username unless one is configured", () => {
    expect(
      decideAccess({
        ...base,
        authorizationHeader: basic("literally-anything", "s3cret"),
      })
    ).toEqual({ type: "allow" });
  });

  it("enforces the username when one is configured", () => {
    expect(
      decideAccess({
        ...base,
        expectedUsername: "alice",
        authorizationHeader: basic("bob", "s3cret"),
      })
    ).toEqual({ type: "challenge" });

    expect(
      decideAccess({
        ...base,
        expectedUsername: "alice",
        authorizationHeader: basic("alice", "s3cret"),
      })
    ).toEqual({ type: "allow" });
  });

  it("locks production when no password is configured", () => {
    // Failing open here would silently publish the site the gate protects.
    expect(
      decideAccess({
        authorizationHeader: null,
        expectedPassword: undefined,
        isProduction: true,
      })
    ).toEqual({ type: "misconfigured" });
  });

  it("stays out of the way in development when no password is configured", () => {
    expect(
      decideAccess({
        authorizationHeader: null,
        expectedPassword: undefined,
        isProduction: false,
      })
    ).toEqual({ type: "allow" });
  });

  it("still enforces a password in development once one is set", () => {
    expect(
      decideAccess({
        authorizationHeader: basic("anyone", "wrong"),
        expectedPassword: "s3cret",
        isProduction: false,
      })
    ).toEqual({ type: "challenge" });
  });
});
