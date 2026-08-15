import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTwilioSignature } from "@/lib/notifications/twilio-signature";

const TOKEN = "test-auth-token";
const URL_ = "https://puchkaman.ca/api/webhooks/twilio/inbound";

/** Twilio's documented scheme: URL + params sorted by key, concatenated. */
function sign(url: string, params: Record<string, string>, token = TOKEN): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", token).update(Buffer.from(payload, "utf-8")).digest("base64");
}

describe("verifyTwilioSignature", () => {
  const params = { From: "+14165550134", Body: "STOP", MessageSid: "SM1" };

  it("accepts a correctly signed request", () => {
    expect(verifyTwilioSignature(URL_, params, TOKEN, sign(URL_, params))).toBe(true);
  });

  it("rejects a missing signature", () => {
    expect(verifyTwilioSignature(URL_, params, TOKEN, null)).toBe(false);
  });

  it("rejects a signature made with a different token", () => {
    expect(verifyTwilioSignature(URL_, params, TOKEN, sign(URL_, params, "other"))).toBe(false);
  });

  it("rejects a tampered parameter", () => {
    const good = sign(URL_, params);
    expect(verifyTwilioSignature(URL_, { ...params, Body: "START" }, TOKEN, good)).toBe(false);
  });

  it("rejects a signature for a different URL", () => {
    const good = sign("https://evil.test/hook", params);
    expect(verifyTwilioSignature(URL_, params, TOKEN, good)).toBe(false);
  });

  it("is insensitive to parameter order", () => {
    const reordered = { MessageSid: "SM1", Body: "STOP", From: "+14165550134" };
    expect(verifyTwilioSignature(URL_, reordered, TOKEN, sign(URL_, params))).toBe(true);
  });

  it("rejects junk without throwing", () => {
    expect(verifyTwilioSignature(URL_, params, TOKEN, "not-base64!!")).toBe(false);
  });
});
