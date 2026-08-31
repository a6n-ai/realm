import { describe, expect, it } from "vitest";
import { bearerToken, generateApiKey, hashApiKey } from "./api-keys";

describe("api keys", () => {
  it("hashes stably", () => {
    expect(hashApiKey("pk_live_abc")).toBe(hashApiKey("pk_live_abc"));
    expect(hashApiKey("pk_live_abc")).not.toBe(hashApiKey("pk_live_abd"));
  });

  it("generates a pk_live secret with matching hash", () => {
    const key = generateApiKey();
    expect(key.secret.startsWith("pk_live_")).toBe(true);
    expect(key.prefix).toBe(key.secret.slice(0, 16));
    expect(key.hash).toBe(hashApiKey(key.secret));
  });

  it("parses Bearer tokens", () => {
    expect(bearerToken("Bearer pk_live_x")).toBe("pk_live_x");
    expect(bearerToken("Basic x")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
