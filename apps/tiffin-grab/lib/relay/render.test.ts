import { describe, expect, it, vi } from "vitest";
import { render } from "react-email";
import { renderEmailForEvent } from "@relay/engine";
import { interpolate } from "@relay/email/interpolate";

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
    if (typeof out === "string") throw new Error("unexpected");
    expect(out.html).toContain(UNSUBSCRIBE_TOKEN);
    expect(out.text).toContain(UNSUBSCRIBE_TOKEN);
    expect(out.html).toContain("1 Main St, Toronto");
  });

  it("escapes customer values in html only; subject and text stay raw", async () => {
    const hostile = "<script>x</script> \"><img src=x>";
    const out = await renderRelayEmail({ ...base, vars: { payment: { ...vars.payment, customerName: hostile } } }, null);
    if (typeof out === "string") throw new Error("unexpected");
    expect(out.html).not.toContain("<script>x</script>");
    expect(out.html).not.toContain("\"><img src=x>");
    expect(out.html).toContain("&lt;script&gt;x&lt;/script&gt; &quot;&gt;&lt;img src=x&gt;");
    expect(out.text).toContain(hostile);
  });

  it("escapes stored-template html and keeps its text raw", async () => {
    const stored = vi.mocked(renderEmailForEvent);
    stored.mockImplementation(async (_db, _t, _e, _l, v) => ({ subject: "S", html: `<p>${(v as { n: string }).n}</p>`, text: `t ${(v as { n: string }).n}` }));
    try {
      const out = await renderRelayEmail({ ...base, event: "menu_released", vars: { n: "<b>&</b>" } }, null);
      expect(out).toEqual({ subject: "S", html: "<p>&lt;b&gt;&amp;&lt;/b&gt;</p>", text: "t <b>&</b>" });
    } finally {
      stored.mockResolvedValue(null);
    }
  });

  it("renders a stored template when there is no code copy, and refuses when there is none", async () => {
    const stored = vi.mocked(renderEmailForEvent);
    await expect(renderRelayEmail({ ...base, event: "menu_released" }, null)).resolves.toBe("missing");
    stored.mockResolvedValue({ subject: "Stored {{payment.customerName}}", html: "<p>h</p>", text: "t" });
    await expect(renderRelayEmail({ ...base, event: "menu_released" }, null)).resolves.toEqual({ subject: "Stored {{payment.customerName}}", html: "<p>h</p>", text: "t" });
    stored.mockResolvedValue(null);
  });

  it("uses override.intro for the lead paragraph, and ignores it where a template has none", async () => {
    const intro = "Hang tight, {{payment.customerName}}.";
    const withIntro = await renderRelayEmail(base, { event: "payment_received", locale: "en", subject: "x", intro, enabled: true });
    expect(withIntro).toMatchObject({ html: expect.stringContaining("Hang tight, Ann.") });
    expect((withIntro as { html: string }).html).not.toContain("our team will check your payment");

    const noLead = { ...base, event: "new_login_alert" };
    const plain = await renderRelayEmail(noLead, null);
    const ignored = await renderRelayEmail(noLead, { event: "new_login_alert", locale: "en", subject: "x", intro, enabled: true });
    expect((ignored as { html: string }).html).toEqual((plain as { html: string }).html);
  });

  it("applies the override subject to stored copy too", async () => {
    vi.mocked(renderEmailForEvent).mockResolvedValue({ subject: "old", html: "h", text: "t" });
    const out = await renderRelayEmail({ ...base, event: "menu_released" }, { event: "menu_released", locale: "en", subject: "New {{payment.customerName}}", intro: null, enabled: true });
    expect(out).toMatchObject({ subject: "New Ann" });
    vi.mocked(renderEmailForEvent).mockResolvedValue(null);
  });
});
