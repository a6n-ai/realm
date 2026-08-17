import { describe, expect, it } from "vitest";
import { EVENT_ENTITY } from "../event-entities";
import { AWARDABLE_EVENTS } from "@/lib/services/wallet.service";

describe("recovery events", () => {
  it("exposes cart_abandoned template variables", () => {
    expect(EVENT_ENTITY.cart_abandoned?.entity).toBe("cart");
    expect(EVENT_ENTITY.cart_abandoned?.fields.map((f) => f.name)).toContain("itemCount");
  });

  it("exposes checkout_abandoned template variables", () => {
    expect(EVENT_ENTITY.checkout_abandoned?.entity).toBe("order");
    expect(EVENT_ENTITY.checkout_abandoned?.fields.map((f) => f.name)).toContain("resumeUrl");
  });

  // app_event is shared with the wallet's event_payout table. A recovery event
  // in AWARDABLE_EVENTS would put a payout switch in the settings grid that no
  // award call site can ever honour.
  it("keeps recovery events out of AWARDABLE_EVENTS", () => {
    expect(AWARDABLE_EVENTS).not.toContain("cart_abandoned");
    expect(AWARDABLE_EVENTS).not.toContain("checkout_abandoned");
  });
});
