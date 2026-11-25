import { describe, expect, it, vi } from "vitest";
import { render } from "react-email";
import { interpolate } from "@relay/engine";

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

  it("refuses an event with no copy, and order_created without an override subject", async () => {
    await expect(renderRelayEmail({ ...base, event: "signup" }, null)).rejects.toThrow("no email template for signup");
    await expect(renderRelayEmail({ ...base, event: "order_created" }, null)).rejects.toThrow("no email template for order_created");
    const out = await renderRelayEmail({ ...base, event: "order_created" }, { event: "order_created", locale: "en", subject: "Order {{order.code}}", intro: null, enabled: true });
    expect(out).toMatchObject({ subject: "Order " });
  });
});
