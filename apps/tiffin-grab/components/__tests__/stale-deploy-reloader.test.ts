import { describe, expect, it } from "vitest";
import { isStaleActionError } from "../stale-deploy-reloader";

describe("isStaleActionError", () => {
  it("matches Next's stale server-action messages", () => {
    expect(isStaleActionError('Failed to find Server Action "abc123".')).toBe(true);
    expect(
      isStaleActionError("Server Action was not found. This request might be from an older or newer deployment."),
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isStaleActionError("TypeError: undefined is not a function")).toBe(false);
    expect(isStaleActionError("Network request failed")).toBe(false);
    expect(isStaleActionError("")).toBe(false);
  });
});
