import { describe, expect, it } from "vitest";
import { isStaleActionError, isStaleActionResponse } from "../stale-deploy-reloader";

describe("isStaleActionError", () => {
  it("matches Next's stale server-action messages", () => {
    expect(isStaleActionError('Failed to find Server Action "abc123".')).toBe(true);
    expect(
      isStaleActionError("Server Action was not found. This request might be from an older or newer deployment."),
    ).toBe(true);
    // What the browser's server-action call rejects with when the action ID is gone.
    expect(isStaleActionError("An unexpected response was received from the server.")).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isStaleActionError("TypeError: undefined is not a function")).toBe(false);
    expect(isStaleActionError("Network request failed")).toBe(false);
    expect(isStaleActionError("")).toBe(false);
  });
});

describe("isStaleActionResponse", () => {
  const notFound = { headers: new Headers({ "x-nextjs-action-not-found": "1" }) };
  it("flags a server-action call the server no longer has", () => {
    expect(isStaleActionResponse({ headers: { "Next-Action": "abc" } }, notFound)).toBe(true);
    expect(isStaleActionResponse({ headers: new Headers({ "next-action": "abc" }) }, notFound)).toBe(true);
  });
  it("ignores ordinary fetches and found actions", () => {
    expect(isStaleActionResponse({ headers: { accept: "text/html" } }, notFound)).toBe(false);
    expect(isStaleActionResponse({ headers: { "Next-Action": "abc" } }, { headers: new Headers() })).toBe(false);
    expect(isStaleActionResponse(undefined, notFound)).toBe(false);
  });
});
