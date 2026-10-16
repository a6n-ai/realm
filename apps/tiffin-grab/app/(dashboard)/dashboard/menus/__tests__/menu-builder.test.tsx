/* eslint-disable */
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
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
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

  it("marks a gap on the grid, counts it, and opens the panel on it", () => {
    render(<MenuBuilder {...dummyProps} problems={[{ kind: "missing", day: "tue", planName: "Veg Plan", planPublicId: "p1", categoryKey: "sabji", categoryLabel: "Sabji", dishNames: [] }]} />);
    expect(screen.getByTestId("menu-gaps")).toHaveTextContent("1 gap may leave some subscribers without a meal");
    expect(screen.getByRole("button", { name: /^Tuesday, Sabji \(Veg Plan\): empty, No dish here for Veg Plan/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("cell-panel")).toHaveTextContent("No dish here for Veg Plan");
    // Clicking another cell moves the panel there.
    fireEvent.click(screen.getByRole("button", { name: /^Monday, Sabji/ }));
    expect(screen.getByTestId("cell-panel")).toHaveTextContent("Shahi Paneer");
  });

  it("keeps draft edits local until Save — no autosave", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockSaveWeek.mockResolvedValue({
      items: [],
      updatedAt: Date.now(),
    });

    render(
      <MenuBuilder
        {...dummyProps}
        dishes={[
          ...dummyProps.dishes,
          { id: "d2", name: "Dal Makhani", category: "sabji", planId: "p1" },
        ]}
      />,
    );

    // The panel opens on Monday's first slot; its dish menu holds Remove.
    expect(screen.getByTestId("cell-panel")).toHaveTextContent("Shahi Paneer");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Options for Shahi Paneer" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockSaveWeek).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mockSaveWeek).toHaveBeenCalledTimes(1));

    vi.useRealTimers();
  });
});
