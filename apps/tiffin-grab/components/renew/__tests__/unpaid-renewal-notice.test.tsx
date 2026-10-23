// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { UnpaidRenewalNotice } from "../unpaid-renewal-notice";

afterEach(cleanup);

describe("UnpaidRenewalNotice", () => {
  it("offers Pay now only when a pay link exists", () => {
    render(<UnpaidRenewalNotice payPublicId="pay_1" />);
    expect(screen.getByRole("link", { name: "Pay now" }).getAttribute("href")).toBe("/me/pay/pay_1");
    expect(screen.queryByRole("link", { name: "Build a different plan" })).toBeNull();
  });

  it("without a pay link: View my plan plus Build a different plan", () => {
    render(<UnpaidRenewalNotice payPublicId={null} />);
    expect(screen.getByRole("link", { name: "View my plan" }).getAttribute("href")).toBe("/me/deliveries");
    expect(screen.getByRole("link", { name: "Build a different plan" }).getAttribute("href")).toBe("/me/renew?full=1");
  });
});
