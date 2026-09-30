// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const validatePostal = vi.fn();
vi.mock("@/app/(public)/subscribe/actions", () => ({ validatePostal: (c: string) => validatePostal(c) }));
const { useDeliveryArea } = await import("../delivery-area");

beforeEach(() => validatePostal.mockReset().mockResolvedValue({ served: true, zone: { publicId: "z", name: "Toronto", slotWindow: null } }));

describe("useDeliveryArea", () => {
  it("does not check on the area (first three characters) alone", () => {
    renderHook(() => useDeliveryArea("m4n"));
    expect(validatePostal).not.toHaveBeenCalled();
  });

  it("checks a full code, spaces ignored", async () => {
    const { result } = renderHook(() => useDeliveryArea("M5H 2N1"));
    await waitFor(() => expect(result.current).toMatchObject({ code: "M5H2N1", served: true, zone: "Toronto" }));
    expect(validatePostal).toHaveBeenCalledWith("M5H2N1");
  });

  it("waits while the code is incomplete", () => {
    renderHook(() => useDeliveryArea("M5H 2"));
    expect(validatePostal).not.toHaveBeenCalled();
  });
});
