// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliveryAddressSchema, type AddressValues } from "@foundry/commons";
import { AddressFields } from "../address-fields";

afterEach(cleanup);

function Harness({ onSpy }: { onSpy?: (v: Partial<AddressValues>) => void }) {
  const [v, setV] = useState<Partial<AddressValues>>({});
  return <AddressFields preset="profile" values={v} onChange={(p) => { setV((o) => ({ ...o, ...p })); onSpy?.(p); }} />;
}

describe("customer AddressFields", () => {
  it("renders the profile preset with a 52px input and a native province select", () => {
    render(<Harness />);
    expect(screen.getByLabelText("Street address").className).toContain("min-h-[52px]");
    expect(screen.getByLabelText("Province").tagName).toBe("SELECT");
  });
  it("province lists every province and 'No province' maps to empty", () => {
    const spy = vi.fn();
    render(<Harness onSpy={spy} />);
    const sel = screen.getByLabelText("Province") as HTMLSelectElement;
    expect(sel.options.length).toBeGreaterThan(10);
    fireEvent.change(sel, { target: { value: "ON" } });
    expect(spy).toHaveBeenLastCalledWith({ province: "ON" });
    fireEvent.change(sel, { target: { value: "__none__" } });
    expect(spy).toHaveBeenLastCalledWith({ province: "" });
  });
  it("shows errors accessibly and marks the field invalid", () => {
    render(<AddressFields preset="delivery" values={{}} onChange={() => {}} errors={{ addressLine: "Address is required" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Address is required");
    expect(screen.getByLabelText("Street address")).toHaveAttribute("aria-invalid", "true");
  });
  it("delivery schema requires name, address, city, postal code", () => {
    const r = deliveryAddressSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(["fullName", "addressLine", "city", "postalCode"]));
  });
});
