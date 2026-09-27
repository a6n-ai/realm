// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DropOffCatalog } from "@/lib/catalog/drop-off";
import { DropOffPicker } from "../drop-off";

afterEach(cleanup);

const catalog: DropOffCatalog = {
  groups: [
    { publicId: "apt", name: "Apartment", description: null },
    { publicId: "home", name: "Home", description: null },
  ],
  connections: [{ publicId: "spot", name: "Drop-off", groupId: "apt" }],
  options: [
    { publicId: "lobby", name: "Lobby", chargeType: "none", chargeValue: 0, groupId: "apt", connectionId: "spot", waivedPct: 0 },
    { publicId: "door", name: "Leave at door", chargeType: "fixed", chargeValue: 1.5, groupId: "apt", connectionId: "spot", waivedPct: 0 },
    { publicId: "call", name: "Call on arrival", chargeType: "none", chargeValue: 0.5, groupId: "apt", connectionId: null, waivedPct: 0 },
    { publicId: "porch", name: "Porch", chargeType: "none", chargeValue: 0, groupId: "home", connectionId: null, waivedPct: 0 },
  ],
  offers: [],
};

describe("DropOffPicker", () => {
  it("shows the place types first and nothing else until one is picked", () => {
    const onChange = vi.fn();
    render(<DropOffPicker catalog={catalog} value={{ tagId: null, strategyIds: [] }} onChange={onChange} />);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Apartment", "Home"]);
    expect(screen.queryByText("Lobby")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Apartment" }));
    expect(onChange).toHaveBeenCalledWith({ tagId: "apt", strategyIds: [] });
  });

  it("a connected set is a pick-one row; other strategies toggle alongside it", () => {
    const onChange = vi.fn();
    render(<DropOffPicker catalog={catalog} value={{ tagId: "apt", strategyIds: ["lobby"] }} onChange={onChange} />);
    expect(screen.getByText("Drop-off")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Leave at door +$1.50" })).toBeTruthy();
    fireEvent.click(screen.getByText("Leave at door"));
    expect(onChange).toHaveBeenLastCalledWith({ tagId: "apt", strategyIds: ["door"] });
    fireEvent.click(screen.getByRole("button", { name: "Call on arrival" }));
    expect(onChange).toHaveBeenLastCalledWith({ tagId: "apt", strategyIds: ["lobby", "call"] });
    // Tapping the picked place again clears everything: it is all optional.
    fireEvent.click(screen.getByRole("radio", { name: "Apartment" }));
    expect(onChange).toHaveBeenLastCalledWith({ tagId: null, strategyIds: [] });
  });

  it("a waived fee shows struck through with Free, and the offer and a cheaper pick are suggested", () => {
    const onChange = vi.fn();
    const waived: DropOffCatalog = {
      ...catalog,
      options: catalog.options.map((o) => (o.publicId === "call" ? { ...o, chargeType: "fixed" as const, chargeValue: 2, waivedPct: 100 } : o)),
      offers: [{ name: "Launch offer", percent: 100 }],
    };
    render(<DropOffPicker catalog={waived} value={{ tagId: "apt", strategyIds: ["door"] }} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Call on arrival +$2.00 Free" })).toBeTruthy();
    expect(screen.getByText("Launch offer")).toBeTruthy();
    expect(screen.getByText(/saves \$1\.50 on Leave at door/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    expect(onChange).toHaveBeenCalledWith({ tagId: "apt", strategyIds: ["lobby"] });
  });
});
