// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validatePostal = vi.fn();
vi.mock("@/app/(public)/subscribe/actions", () => ({ validatePostal: (c: string) => validatePostal(c) }));
const { DeliveryAreaNote, useDeliveryArea } = await import("../delivery-area");

beforeEach(() => validatePostal.mockReset().mockResolvedValue({ served: true, zone: { publicId: "z", name: "Toronto", slotWindow: null } }));

describe("useDeliveryArea", () => {
  it("checks as soon as the area (first three characters) is known — an intersection only resolves that far", async () => {
    const { result } = renderHook(() => useDeliveryArea("m4n"));
    await waitFor(() => expect(result.current).toMatchObject({ code: "M4N", served: true, zone: "Toronto" }));
    expect(validatePostal).toHaveBeenCalledWith("M4N");
  });

  it("checks a full code, spaces ignored", async () => {
    const { result } = renderHook(() => useDeliveryArea("M5H 2N1"));
    await waitFor(() => expect(result.current?.code).toBe("M5H2N1"));
  });

  it("waits while the code is incomplete", () => {
    renderHook(() => useDeliveryArea("M5H 2"));
    expect(validatePostal).not.toHaveBeenCalled();
  });

  it("a served area alone asks for the full code instead of saying we deliver", () => {
    render(<DeliveryAreaNote area={{ code: "M4N", served: true, zone: "Toronto", slotWindow: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Now enter your full postal code");
  });
});
