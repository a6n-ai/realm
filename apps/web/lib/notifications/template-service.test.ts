import { describe, expect, it } from "vitest";
import { pickTemplate } from "./template-service";

const rows = [
  { channel: "email", locale: "en", subject: "EN {{order.code}}", body: "en body", enabled: true },
  { channel: "email", locale: "fr", subject: "FR {{order.code}}", body: "fr body", enabled: true },
];

describe("pickTemplate", () => {
  it("prefers the recipient locale", () => {
    expect(pickTemplate(rows, "email", "fr")?.subject).toBe("FR {{order.code}}");
  });
  it("falls back to en when locale missing", () => {
    expect(pickTemplate(rows, "email", "de")?.subject).toBe("EN {{order.code}}");
  });
  it("returns null when channel has no template", () => {
    expect(pickTemplate(rows, "in_app", "en")).toBeNull();
  });
  it("skips a disabled matching row, falling back to en", () => {
    const disabled = [
      { channel: "email", locale: "en", subject: "EN {{order.code}}", body: "en body", enabled: true },
      { channel: "email", locale: "fr", subject: "x", body: "y", enabled: false },
    ];
    expect(pickTemplate(disabled, "email", "fr")?.subject).toBe("EN {{order.code}}");
  });
});
