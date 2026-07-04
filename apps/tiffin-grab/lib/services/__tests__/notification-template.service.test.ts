import { describe, expect, it } from "vitest";
import { ValidationError } from "@realm/commons";
import { sampleVars, assertValidVars, upsertTemplate } from "@/lib/services/notification-template.service";

describe("notification-template.service", () => {
  it("builds sample vars from the registry", () => {
    const vars = sampleVars("order_activated") as { order: { code: string } };
    expect(vars.order.code).toBeTypeOf("string");
  });
  it("rejects a body with unknown variables", () => {
    expect(() => assertValidVars("order_activated", "{{order.bogus}}")).toThrow(ValidationError);
  });
  it("accepts a body with only known variables", () => {
    expect(() => assertValidVars("order_activated", "{{order.code}}")).not.toThrow();
  });
  it("returns {} sample for events with no entity", () => {
    expect(sampleVars("manual_adjustment")).toEqual({});
  });
});

describe("upsertTemplate validation", () => {
  it("rejects an email template missing html", async () => {
    await expect(
      upsertTemplate({ event: "order_activated", channel: "email", locale: "en", subject: "s", body: "<p>x</p>", html: "", text: "t", enabled: true } as never),
    ).rejects.toThrow();
  });
  it("rejects an in_app template missing body", async () => {
    await expect(
      upsertTemplate({ event: "order_activated", channel: "in_app", locale: "en", subject: "s", body: "", enabled: true } as never),
    ).rejects.toThrow();
  });
});
