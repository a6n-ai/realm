import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
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
});
