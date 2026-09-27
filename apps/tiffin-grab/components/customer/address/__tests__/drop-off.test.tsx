// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DropOffCatalog } from "@/lib/catalog/drop-off";
import { DropOffPicker } from "../drop-off";

afterEach(cleanup);

const catalog: DropOffCatalog = {
  groups: [
    { publicId: "spot", name: "Drop-off spot", description: null, required: false },
    { publicId: "contact", name: "Contact", description: null, required: true },
  ],
  options: [
    { publicId: "door", name: "Frontdoor", chargeType: "none", chargeValue: 0, groupId: "spot" },
    { publicId: "lobby", name: "Lobby", chargeType: "fixed", chargeValue: 1.5, groupId: "spot" },
    { publicId: "call", name: "Call on arrival", chargeType: "none", chargeValue: 0, groupId: "contact" },
  ],
};

describe("DropOffPicker", () => {
  it("shows every tag first and opens the unanswered required one", () => {
    render(<DropOffPicker catalog={catalog} value={[]} onChange={() => {}} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\u00a0/g, " "))).toEqual(["Drop-off spot", "Contact *"]);
    expect(screen.getByRole("tab", { name: /Contact/ })).toHaveAttribute("aria-selected", "true");
    // Required: no "No preference".
    expect(screen.queryByText("No preference")).toBeNull();
    expect(screen.getByText("Call on arrival")).toBeInTheDocument();
  });

  it("switching tags shows that tag's strategies, and a pick replaces only its own tag", () => {
    const onChange = vi.fn();
    render(<DropOffPicker catalog={catalog} value={["call"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: /Drop-off spot/ }));
    expect(screen.getByText("Lobby · +$1.50")).toBeInTheDocument();
    expect(screen.getByText("No preference")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Lobby · +$1.50"));
    expect(onChange).toHaveBeenCalledWith(["call", "lobby"]);
    // The answered tag shows its pick on the chip.
    expect(screen.getByRole("tab", { name: /Contact/ })).toHaveTextContent("Contact · Call on arrival");
  });
});
