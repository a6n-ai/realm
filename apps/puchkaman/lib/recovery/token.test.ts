import { beforeEach, describe, expect, it } from "vitest";
import { mintResumeToken, verifyResumeToken } from "./token";

const NOW = 1_770_000_000_000;
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  process.env.RECOVERY_LINK_SECRET = "test-secret-value";
});

describe("resume token", () => {
  it("verifies a token it just minted", () => {
    const t = mintResumeToken("ord_abc123", NOW + HOUR);
    expect(verifyResumeToken("ord_abc123", t, NOW)).toBe(true);
  });

  it("refuses a token past its expiry", () => {
    const t = mintResumeToken("ord_abc123", NOW - 1);
    expect(verifyResumeToken("ord_abc123", t, NOW)).toBe(false);
  });

  it("refuses a token minted for a different order", () => {
    const t = mintResumeToken("ord_abc123", NOW + HOUR);
    expect(verifyResumeToken("ord_other99", t, NOW)).toBe(false);
  });

  it("refuses a tampered signature", () => {
    const t = mintResumeToken("ord_abc123", NOW + HOUR);
    const [exp] = t.split(".");
    expect(verifyResumeToken("ord_abc123", `${exp}.deadbeef`, NOW)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    const t = mintResumeToken("ord_abc123", NOW + HOUR);
    delete process.env.RECOVERY_LINK_SECRET;
    expect(verifyResumeToken("ord_abc123", t, NOW)).toBe(false);
  });
});
