import { describe, expect, it } from "vitest";
import { pickTemplate, type TemplateRow } from "./template";

const row = (over: Partial<TemplateRow>): TemplateRow => ({
  channel: "email", locale: "en", subject: "s", body: null, html: "<p>h</p>",
  text: "t", providerTemplateId: null, enabled: true, ...over,
});

describe("pickTemplate", () => {
  it("returns null when no row matches the channel", () => {
    expect(pickTemplate([row({ channel: "in_app" })], "email", "en")).toBeNull();
  });

  it("ignores disabled rows", () => {
    expect(pickTemplate([row({ enabled: false })], "email", "en")).toBeNull();
  });

  it("prefers the requested locale", () => {
    const rows = [row({ locale: "en", subject: "english" }), row({ locale: "fr", subject: "french" })];
    expect(pickTemplate(rows, "email", "fr")!.subject).toBe("french");
  });

  it("falls back to en when the requested locale is absent", () => {
    const rows = [row({ locale: "en", subject: "english" })];
    expect(pickTemplate(rows, "email", "fr")!.subject).toBe("english");
  });
});
