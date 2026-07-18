import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/email/provider", () => ({ getEmailProvider: () => ({ send }) }));

import { sendPasswordResetEmail, sendVerificationEmail } from "./emails";

beforeEach(() => vi.clearAllMocks());

describe("auth transactional email", () => {
  it("sends a rendered reset email to the user's address with the url embedded", async () => {
    send.mockResolvedValue({ providerMessageId: "m1", provider: "ses" });
    await sendPasswordResetEmail({ id: "u1", email: "a@b.com" }, "https://app.tiffingrab.ca/reset?token=x");

    expect(send).toHaveBeenCalledOnce();
    const msg = send.mock.calls[0][0];
    expect(msg.to).toEqual({ email: "a@b.com" });
    expect(msg.subject).toContain("Reset");
    expect(msg.html).toContain("https://app.tiffingrab.ca/reset?token=x");
    expect(msg.text).toContain("https://app.tiffingrab.ca/reset?token=x");
  });

  it("skips sending when the user has no email (phone-first accounts)", async () => {
    await sendVerificationEmail({ id: "u2", email: null }, "https://x/verify");
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows provider failures so the auth flow never breaks", async () => {
    send.mockRejectedValue(new Error("SES down"));
    await expect(sendPasswordResetEmail({ id: "u3", email: "a@b.com" }, "https://x")).resolves.toBeUndefined();
  });
});
