import { describe, expect, it } from "vitest";
import { render } from "react-email";
import { TEMPLATES } from "../transactional";
import { EVENT_ENTITY, availableVariables } from "@/lib/notifications/event-entities";

describe("transactional email templates", () => {
  it("covers each event once", () => {
    const events = TEMPLATES.map((t) => t.event);
    expect(new Set(events).size).toBe(events.length);
  });

  it.each(TEMPLATES.map((t) => [t.event, t] as const))("%s renders the shared footer and keeps placeholders", async (event, t) => {
    const html = await render(t.element);
    const text = await render(t.element, { plainText: true });
    expect(html).toContain("Email preferences");
    expect(html).toContain("https://app.tiffingrab.ca/me/account?section=notifications");
    expect(html).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(text).toContain("Tiffin Grab");
    // Registry-backed events must only use variables the editor knows about.
    if (EVENT_ENTITY[event as keyof typeof EVENT_ENTITY]) {
      const known = new Set(availableVariables(event as never));
      for (const m of `${t.subject}${html}`.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) expect(known).toContain(m[1]);
    }
  });

  it.each([
    ["order_complimentary", "Hi {{order.customerName}}, we added a free tiffin to your plan."],
    ["holiday_declared", "Hi {{order.customerName}}, our kitchen is closed on {{order.date}}."],
    ["holiday_removed", "Hi {{order.customerName}}, we told you our kitchen would be closed on {{order.date}} for {{order.holidayName}}."],
    ["order_renewal_reminder", "Hi {{order.customerName}}, your {{order.mealSize}} plan ends {{order.lastTiffinWhen}}."],
    ["order_receipt", "Hi {{order.customerName}}, your receipt for order {{order.code}} ({{order.mealSize}}) is attached as a PDF."],
  ])("%s keeps its greeting line", async (event, line) => {
    const t = TEMPLATES.find((x) => x.event === event)!;
    expect((await render(t.element, { plainText: true })).replace(/\s+/g, " ")).toContain(line);
  });

  it("order_receipt keeps its subject", () => {
    expect(TEMPLATES.find((x) => x.event === "order_receipt")!.subject).toBe("Your Tiffin Grab receipt for order {{order.code}}");
  });
});
