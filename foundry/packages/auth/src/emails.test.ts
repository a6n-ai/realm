import { describe, expect, it, vi } from "vitest";
import { sendNewLogin, sendOtpEmail, sendPasswordChanged, sendWelcomeVerify } from "./emails";

function fake() {
  const send = vi.fn().mockResolvedValue({ providerMessageId: "m", provider: "fake" });
  const ctx = {
    provider: { name: "fake", send } as never,
    appName: "Tiffin Grab",
    log: { debug: vi.fn(), error: vi.fn() },
  };
  return { ctx, send };
}

describe("security email senders", () => {
  it("routes forget-password to reset-code copy carrying the OTP", async () => {
    const { ctx, send } = fake();
    await sendOtpEmail(ctx, "a@b.com", "123456", "forget-password");
    const msg = send.mock.calls[0][0];
    expect(msg.to).toEqual({ email: "a@b.com" });
    expect(msg.subject).toMatch(/reset code/i);
    expect(msg.html).toContain("123456");
  });

  it("routes email-verification / change-email to verification-code copy", async () => {
    const { ctx, send } = fake();
    await sendOtpEmail(ctx, "a@b.com", "999000", "change-email");
    expect(send.mock.calls[0][0].subject).toMatch(/verification code/i);
    expect(send.mock.calls[0][0].html).toContain("999000");
  });

  it("new-login alert includes the IP", async () => {
    const { ctx, send } = fake();
    await sendNewLogin(ctx, "a@b.com", { ip: "9.9.9.9", userAgent: "UA", when: "now" });
    expect(send.mock.calls[0][0].html).toContain("9.9.9.9");
  });

  it("skips send when the recipient has no address", async () => {
    const { ctx, send } = fake();
    await sendWelcomeVerify(ctx, "", "https://x/verify");
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows provider failures (auth flows must not break)", async () => {
    const { ctx, send } = fake();
    send.mockRejectedValue(new Error("SES down"));
    await expect(sendPasswordChanged(ctx, "a@b.com")).resolves.toBeUndefined();
    expect(ctx.log.error).toHaveBeenCalled();
  });
});
