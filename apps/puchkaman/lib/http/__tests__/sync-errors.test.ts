import { beforeEach, describe, expect, it, vi } from "vitest";

const warning = vi.fn();
vi.mock("sonner", () => ({ toast: { warning: (...a: unknown[]) => warning(...a) } }));

const { toastSyncErrors } = await import("../sync-errors");

beforeEach(() => warning.mockClear());

describe("toastSyncErrors", () => {
  it("says nothing when there is nothing wrong", () => {
    toastSyncErrors([]);
    toastSyncErrors(undefined);
    expect(warning).not.toHaveBeenCalled();
  });

  it("shows the upstream message, not a count", () => {
    toastSyncErrors([
      { entity: "menu", message: "Clover API 400: Developer App Id is required" },
    ]);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]![0]).toBe(
      "menu: Clover API 400: Developer App Id is required",
    );
    // A lone failure needs no "+N more" line.
    expect(warning.mock.calls[0]![1]).not.toHaveProperty("description");
  });

  it("waits to be dismissed rather than timing out", () => {
    toastSyncErrors([{ entity: "menu", message: "boom" }]);
    expect(warning.mock.calls[0]![1]).toMatchObject({
      duration: Infinity,
      closeButton: true,
    });
  });

  it("keeps the first message in full and counts the rest", () => {
    toastSyncErrors([
      { entity: "menu", message: "boom" },
      { entity: "category", message: "also boom" },
      { entity: "tax_rate", message: "and again" },
    ]);
    expect(warning.mock.calls[0]![0]).toBe("menu: boom");
    expect(warning.mock.calls[0]![1]).toMatchObject({ description: "+2 more" });
  });

  it("falls back through the subject fields and honours a prefix", () => {
    toastSyncErrors([{ item: "Aalo tikki Burger", message: "rejected" }], "Push failed");
    expect(warning.mock.calls[0]![0]).toBe("Push failed: Aalo tikki Burger: rejected");

    warning.mockClear();
    toastSyncErrors([{ publicId: "prd_1", message: "rejected" }]);
    expect(warning.mock.calls[0]![0]).toBe("prd_1: rejected");

    warning.mockClear();
    toastSyncErrors([{ message: "bare" }]);
    expect(warning.mock.calls[0]![0]).toBe("bare");
  });
});
