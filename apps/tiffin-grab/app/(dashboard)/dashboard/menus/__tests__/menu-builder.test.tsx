// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MenuBuilder } from "../menu-builder";

const mockMarkReady = vi.fn();
const mockBackToDraft = vi.fn();
const mockReleaseWeek = vi.fn();
const mockSaveWeek = vi.fn();
const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("../actions", () => ({
  markReady: (...args: unknown[]) => mockMarkReady(...args),
  backToDraft: (...args: unknown[]) => mockBackToDraft(...args),
  releaseWeek: (...args: unknown[]) => mockReleaseWeek(...args),
  saveWeek: (...args: unknown[]) => mockSaveWeek(...args),
  amendImpact: vi.fn(),
  copyWeek: vi.fn(),
  createDish: vi.fn(),
}));

describe("MenuBuilder rigorous button events & error handling", () => {
  const baseWeek = {
    id: "mw_123",
    weekStart: "2026-09-21",
    status: "draft",
    updatedAt: Date.now(),
  };

  const dummyProps = {
    mealType: { key: "tiffin", label: "Tiffin" } as any,
    slots: [
      {
        key: "sabji|p1",
        categoryKey: "sabji",
        categoryLabel: "Sabji",
        selectable: true,
        sortOrder: 1,
        planPublicId: "p1",
        planName: "Veg Plan",
      },
    ],
    plans: [{ publicId: "p1", name: "Veg Plan" }],
    categoryCounts: { sabji: 1 },
    dishes: [{ id: "d1", name: "Shahi Paneer", category: "sabji", planId: "p1" }],
    week: baseWeek,
    items: [
      { id: "item1", dayOfWeek: "mon", slot: "sabji", dishId: "d1", position: 1, isDefault: true },
    ],
    copySources: [],
    problems: [],
  };

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("handles 'Mark ready' button click and catches/sanitizes #441 error without crashing", async () => {
    mockMarkReady.mockResolvedValueOnce({
      error: "Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441",
    });

    render(<MenuBuilder {...dummyProps} />);

    const markReadyBtn = screen.getByRole("button", { name: "Mark ready" });
    fireEvent.click(markReadyBtn);

    await waitFor(() => {
      // Must NOT display Minified React error #441
      expect(screen.queryByText(/Minified React error/)).not.toBeInTheDocument();
      expect(screen.queryByText(/invariant=441/)).not.toBeInTheDocument();
      // Must display sanitized fallback
      expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    });
  });

  it("handles 'Mark ready' button click when action throws unexpected error without crashing", async () => {
    mockMarkReady.mockRejectedValueOnce(
      new Error("Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441"),
    );

    render(<MenuBuilder {...dummyProps} />);

    const markReadyBtn = screen.getByRole("button", { name: "Mark ready" });
    fireEvent.click(markReadyBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Minified React error/)).not.toBeInTheDocument();
      expect(screen.getByText("Action failed. Please try again.")).toBeInTheDocument();
    });
  });

  it("handles 'Back to draft' button click when in ready state", async () => {
    mockBackToDraft.mockResolvedValueOnce({
      error: "Session expired. Please log in again.",
    });

    render(<MenuBuilder {...dummyProps} week={{ ...baseWeek, status: "ready" }} />);

    const backToDraftBtn = screen.getByRole("button", { name: "Back to draft" });
    fireEvent.click(backToDraftBtn);

    await waitFor(() => {
      expect(screen.getByText("Session expired. Please log in again.")).toBeInTheDocument();
    });
  });

  it("handles 'Release menu' button click when release fails with unexpected error", async () => {
    mockReleaseWeek.mockResolvedValueOnce({
      error: "Unable to complete request. Please try again.",
    });

    render(<MenuBuilder {...dummyProps} />);

    const releaseBtn = screen.getByRole("button", { name: "Release menu" });
    fireEvent.click(releaseBtn);

    await waitFor(() => {
      expect(screen.getByText("Unable to complete request. Please try again.")).toBeInTheDocument();
    });
  });
});
