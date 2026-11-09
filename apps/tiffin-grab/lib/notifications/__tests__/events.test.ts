import { describe, expect, it } from "vitest";
import { appEvent } from "@/db/schema";
import { EVENTS, NOTIFICATION_EVENTS, orderTemplateVars } from "../events";
import { eventCategory } from "../event-categories";

describe("EVENTS", () => {
  it("has exactly the appEvent enum values", () => {
    expect(Object.keys(EVENTS).sort()).toEqual([...appEvent.enumValues].sort());
  });
  it("lists every event but the ledger-only adjustment", () => {
    expect(NOTIFICATION_EVENTS).toContain("holiday_declared");
    expect(NOTIFICATION_EVENTS).not.toContain("manual_adjustment");
  });
  it("categorises from the registry", () => {
    expect(eventCategory("order_receipt")).toBe("orders");
    expect(eventCategory("menu_released")).toBe("marketing");
    expect(eventCategory("holiday_declared")).toBe("account");
    expect(eventCategory("unknown_event")).toBe("account");
  });
});

describe("orderTemplateVars", () => {
  it("falls back to 'there' for a missing or empty name", () => {
    expect(orderTemplateVars("SUB-1", null)).toEqual({ code: "SUB-1", customerName: "there" });
    expect(orderTemplateVars("SUB-1", "", { date: "x" })).toEqual({ code: "SUB-1", customerName: "there", date: "x" });
    expect(orderTemplateVars("SUB-1", "Asha").customerName).toBe("Asha");
  });
});
