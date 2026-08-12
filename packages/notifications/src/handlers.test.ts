import { describe, expect, it, vi } from "vitest";
import { resolveRecipientAddress } from "./handlers";

describe("resolveRecipientAddress", () => {
  it("prefers the literal address on the row", async () => {
    const load = vi.fn();
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: "row@x.com", recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "row@x.com", locale: "en" });
    expect(load).not.toHaveBeenCalled();
  });

  it("falls back to the user row when no literal address is stored", async () => {
    const load = vi.fn().mockResolvedValue({ email: "user@x.com", phone: null, locale: "fr" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toEqual({ address: "user@x.com", locale: "fr" });
  });

  it("returns null when neither source has an address", async () => {
    const load = vi.fn().mockResolvedValue({ email: null, phone: null, locale: "en" });
    const got = await resolveRecipientAddress(
      { recipientId: 7n, recipientEmail: null, recipientPhone: null },
      "email",
      load,
    );
    expect(got).toBeNull();
  });

  it("uses the phone column for sms", async () => {
    const got = await resolveRecipientAddress(
      { recipientId: null, recipientEmail: null, recipientPhone: "+14165550134" },
      "sms",
      vi.fn(),
    );
    expect(got).toEqual({ address: "+14165550134", locale: "en" });
  });
});
