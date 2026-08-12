/**
 * Password gate for the whole site.
 *
 * The decision is kept here as a pure function so it can be tested directly;
 * the middleware only turns the result into an HTTP response.
 */

export type AccessDecision =
  | { type: "allow" }
  | { type: "challenge" }
  | { type: "misconfigured" };

export interface AccessInput {
  authorizationHeader: string | null;
  expectedPassword: string | undefined;
  /** Optional. When unset, any username is accepted and only the password matters. */
  expectedUsername?: string;
  isProduction: boolean;
}

/**
 * Compares without short-circuiting on the first differing character, so a
 * wrong guess does not leak how much of it was correct. Length still differs
 * observably, which is an acceptable tradeoff for a shared-link gate.
 */
export function secureCompare(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return mismatch === 0;
}

/** Splits `user:password` on the first colon, since passwords may contain colons. */
export function parseBasicCredentials(
  header: string | null
): { username: string; password: string } | null {
  if (!header) return null;

  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return null;

  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return null;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return null;

  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export function decideAccess(input: AccessInput): AccessDecision {
  const { authorizationHeader, expectedPassword, expectedUsername, isProduction } =
    input;

  if (!expectedPassword) {
    // Locally an unset password just means the gate is off, so development
    // stays frictionless. In production it almost certainly means the
    // environment variable was forgotten, and failing open would quietly
    // publish the site the gate was added to protect.
    return isProduction ? { type: "misconfigured" } : { type: "allow" };
  }

  const credentials = parseBasicCredentials(authorizationHeader);
  if (!credentials) return { type: "challenge" };

  const usernameOk = expectedUsername
    ? secureCompare(credentials.username, expectedUsername)
    : true;
  const passwordOk = secureCompare(credentials.password, expectedPassword);

  return usernameOk && passwordOk ? { type: "allow" } : { type: "challenge" };
}
