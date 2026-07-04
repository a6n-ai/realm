import { describe, expect, it } from "vitest";
import { availableVariables, validateTemplateVars } from "./event-entities";

describe("event-entities", () => {
  it("lists entity-prefixed variables for an event", () => {
    expect(availableVariables("order_activated")).toContain("order.code");
  });
  it("returns no unknown vars when the template only uses known ones", () => {
    expect(validateTemplateVars("order_activated", "Hi {{order.code}}")).toEqual([]);
  });
  it("flags unknown variables", () => {
    expect(validateTemplateVars("order_activated", "{{order.nope}} {{x.y}}")).toEqual(["order.nope", "x.y"]);
  });
  it("returns [] available for events with no entity", () => {
    expect(availableVariables("manual_adjustment")).toEqual([]);
  });
});
