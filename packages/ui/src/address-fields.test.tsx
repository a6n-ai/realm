// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddressFields } from "./address-fields";

afterEach(cleanup);

describe("AddressFields", () => {
  it("renders a plain input with no dropdown when onResolve/resolveUrl are omitted", () => {
    render(<AddressFields values={{}} onChange={vi.fn()} preset="delivery" />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Street address")).toBeInTheDocument();
  });

  it("shows suggestions from the suggest endpoint and fills fields + reports lat/lng on pick", async () => {
    const onChange = vi.fn();
    const onResolve = vi.fn();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/suggest")) {
        return new Response(
          JSON.stringify({ suggestions: [{ placeId: "p1", label: "123 Main St, Toronto" }] }),
        );
      }
      return new Response(
        JSON.stringify({
          place: { lat: 43.6, lng: -79.4, addressLine: "123 Main St", city: "Toronto" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AddressFields
        values={{ addressLine: "" }}
        onChange={onChange}
        onResolve={onResolve}
        resolveUrl="/api/address/resolve"
        fields={["addressLine"]}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "123 Main" } });

    await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument(), { timeout: 1000 });
    const option = screen.getByRole("option", { name: "123 Main St, Toronto" });
    fireEvent.mouseDown(option);

    expect(onChange).toHaveBeenCalledWith({ addressLine: "123 Main St, Toronto" });
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith({ lat: 43.6, lng: -79.4 }));
    expect(onChange).toHaveBeenCalledWith({ addressLine: "123 Main St", city: "Toronto" });

    vi.unstubAllGlobals();
  });
});
