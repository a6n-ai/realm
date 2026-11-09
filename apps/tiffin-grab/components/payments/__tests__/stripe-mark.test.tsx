// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { paymentMethodLabel } from "@/lib/payments/method-label";
import { MethodName } from "../stripe-mark";

afterEach(cleanup);

describe("MethodName", () => {
  it("puts an aria-hidden Stripe mark beside Card", () => {
    const { container } = render(<MethodName method="stripe">{paymentMethodLabel("stripe", "full")}</MethodName>);
    expect(container).toHaveTextContent("Card");
    expect(container).not.toHaveTextContent("Stripe");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("adds nothing to other methods", () => {
    const { container } = render(<MethodName method="cash">Cash</MethodName>);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("every variant calls a card payment Card", () => {
    expect((["full", "short", "customer"] as const).map((v) => paymentMethodLabel("stripe", v))).toEqual(["Card", "Card", "Card"]);
  });
});
