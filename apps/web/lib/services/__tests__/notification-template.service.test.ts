import { describe, expect, it } from "vitest";
import { ValidationError } from "@tiffin/commons";
import { sampleVars, assertValidVars } from "@/lib/services/notification-template.service";

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
