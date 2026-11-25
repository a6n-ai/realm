import { describe, expect, it, vi } from "vitest";
import { render } from "react-email";
import { interpolate, renderEmailForEvent } from "@relay/engine";

vi.mock("@relay/engine", async (orig) => ({ ...(await orig<object>()), renderEmailForEvent: vi.fn(async () => null) }));
vi.mock("@/lib/notifications/campaign-config", () => ({
  campaignConfig: async () => ({ sender: { name: "Tiffin Grab", postalAddress: "1 Main St, Toronto" } }),
}));

import { TEMPLATES } from "@/emails/transactional";
import { renderRelayEmail, UNSUBSCRIBE_TOKEN } from "./render";

const vars = { payment: { customerName: "Ann", amount: "$10.00", orderCode: "TG-1", method: "e-Transfer" } };
const base = { event: "payment_received", locale: "en", vars, stream: "transactional" as const };
const tpl = TEMPLATES.find((t) => t.event === "payment_received")!;

describe("renderRelayEmail", () => {
  it("matches the stored default (seed render plus interpolation) with no override", async () => {
    const html = interpolate(await render(tpl.element as never), vars);
    const text = interpolate(await render(tpl.element as never, { plainText: true }), vars);
    expect(await renderRelayEmail(base, null)).toEqual({ subject: tpl.subject, html, text });
  });

  it("uses the override subject", async () => {
    const out = await renderRelayEmail(base, { event: "payment_received", locale: "en", subject: "Got it, {{payment.customerName}}", intro: null, enabled: true });
    expect(out).toMatchObject({ subject: "Got it, Ann" });
  });

  it("returns disabled when the override is off", async () => {
    expect(await renderRelayEmail(base, { event: "payment_received", locale: "en", subject: "x", intro: null, enabled: false })).toBe("disabled");
  });

  it("keeps the unsubscribe token literal in marketing mail, with the postal address", async () => {
    const out = await renderRelayEmail({ ...base, stream: "marketing" }, null);
    expect(out).not.toBe("disabled");
    if (out === "disabled") return;
    expect(out.html).toContain(UNSUBSCRIBE_TOKEN);
    expect(out.text).toContain(UNSUBSCRIBE_TOKEN);
    expect(out.html).toContain("1 Main St, Toronto");
  });

  it("renders a stored template when there is no code copy, and refuses when there is none", async () => {
    const stored = vi.mocked(renderEmailForEvent);
    await expect(renderRelayEmail({ ...base, event: "menu_released" }, null)).rejects.toThrow("no email template for menu_released");
    stored.mockResolvedValueOnce({ subject: "Stored {{payment.customerName}}", html: "<p>h</p>", text: "t" });
    await expect(renderRelayEmail({ ...base, event: "menu_released" }, null)).resolves.toEqual({ subject: "Stored {{payment.customerName}}", html: "<p>h</p>", text: "t" });
  });

  it("applies the override subject to stored copy too", async () => {
    vi.mocked(renderEmailForEvent).mockResolvedValueOnce({ subject: "old", html: "h", text: "t" });
    const out = await renderRelayEmail({ ...base, event: "menu_released" }, { event: "menu_released", locale: "en", subject: "New {{payment.customerName}}", intro: null, enabled: true });
    expect(out).toMatchObject({ subject: "New Ann" });
  });
});
