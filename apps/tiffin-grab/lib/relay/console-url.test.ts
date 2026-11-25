import { describe, expect, it } from "vitest";
import { checkConsoleUrl } from "@/lib/relay/console-url";

describe("checkConsoleUrl", () => {
  const base = "https://relay.example.test";

  it("passes a URL on the configured origin", () => {
    expect(checkConsoleUrl("https://relay.example.test/console/campaigns/1", base)).toBe("https://relay.example.test/console/campaigns/1");
  });

  it("refuses another host, another scheme, a malformed URL, or no configured base", () => {
    expect(() => checkConsoleUrl("https://evil.example.test/x", base)).toThrow("off the configured origin");
    expect(() => checkConsoleUrl("http://relay.example.test/x", base)).toThrow("off the configured origin");
    expect(() => checkConsoleUrl("javascript:alert(1)", base)).toThrow("off the configured origin");
    expect(() => checkConsoleUrl("https://relay.example.test/x", undefined)).toThrow("off the configured origin");
  });
});
