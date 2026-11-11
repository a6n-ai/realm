// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContactChips, whatsappHref } from "./contact-chips";

afterEach(cleanup);

describe("whatsappHref", () => {
  it("uses the WhatsApp number when one is set, else the phone", () => {
    expect(whatsappHref({ phone: "+14165550123", whatsappPhone: "+14165550999" })).toBe("https://wa.me/14165550999");
    expect(whatsappHref({ phone: "+14165550123", whatsappPhone: null })).toBe("https://wa.me/14165550123");
    expect(whatsappHref({ phone: "+14165550123", whatsappPhone: "" })).toBe("https://wa.me/14165550123");
  });

  it("returns null when there is no number to message", () => {
    expect(whatsappHref({ phone: null, whatsappPhone: null })).toBeNull();
  });
});

describe("ContactChips", () => {
  it("renders Call and WhatsApp as outline links with the number visible and _blank for WhatsApp", () => {
    render(<ContactChips name="Asha Rao" phone="+14165550123" whatsappPhone={null} email={null} />);
    const call = screen.getByRole("link", { name: /Call Asha Rao/ });
    expect(call).toHaveAttribute("href", "tel:+14165550123");
    expect(call).toHaveTextContent("+1 416 555 0123");
    const wa = screen.getByRole("link", { name: /WhatsApp/ });
    expect(wa).toHaveAttribute("href", "https://wa.me/14165550123");
    expect(wa).toHaveAttribute("target", "_blank");
    expect(wa).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows an email chip only when an email exists", () => {
    const { unmount } = render(<ContactChips name="Asha Rao" phone="+14165550123" whatsappPhone={null} email="asha@example.com" />);
    expect(screen.getByRole("link", { name: "asha@example.com" })).toHaveAttribute("href", "mailto:asha@example.com");
    unmount();
    render(<ContactChips name="Asha Rao" phone="+14165550123" whatsappPhone={null} email={null} />);
    expect(screen.queryByRole("link", { name: /asha@example.com/ })).not.toBeInTheDocument();
  });

  it("shows No phone and no call or WhatsApp links when there is no phone", () => {
    render(<ContactChips name="Asha Rao" phone={null} whatsappPhone={null} email={null} />);
    expect(screen.getByText("No phone")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Call|WhatsApp/ })).not.toBeInTheDocument();
  });
});
