import { describe, expect, it } from "vitest";
import { newOrderHref } from "../selections";

describe("newOrderHref", () => {
  it("opens the full stepper, never Quick Renew", () => {
    expect(newOrderHref({})).toBe("/me/renew?full=1");
  });

  it("keeps a staff estimate link's picks", () => {
    expect(newOrderHref(new URLSearchParams("p=veg&w=4&other=x"))).toBe("/me/renew?full=1&p=veg&w=4");
  });
});
