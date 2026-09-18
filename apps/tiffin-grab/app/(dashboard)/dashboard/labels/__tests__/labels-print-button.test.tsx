// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LabelsPrintButton, labelsPrintBlockReason } from "../labels-print-button";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("labelsPrintBlockReason", () => {
  it("explains an unreleased week in kitchen language, not a raw ISO date", () => {
    expect(
      labelsPrintBlockReason({ menuReleased: false, labelCount: 0, weekStart: "2026-09-14" }),
    ).toMatch(/week of Sep 14 – Sep 20/i);
  });

  it("explains an empty day when the menu is released", () => {
    expect(
      labelsPrintBlockReason({ menuReleased: true, labelCount: 0, weekStart: "2026-09-14" }),
    ).toMatch(/no tiffin deliveries/i);
  });

  it("is silent when there is something to print", () => {
    expect(
      labelsPrintBlockReason({ menuReleased: true, labelCount: 3, weekStart: "2026-09-14" }),
    ).toBeNull();
  });
});

describe("LabelsPrintButton", () => {
  it("pops the unreleased-week message instead of navigating to the PDF route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LabelsPrintButton
        dateIso="2026-09-17"
        weekStart="2026-09-14"
        menuReleased={false}
        labelCount={0}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /print labels/i }));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toHaveTextContent(/no menu is released/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the PDF route's message when the server refuses after the page loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: async () => "No menu is released for the week of Sep 14 – Sep 20. Release that week first.",
      }),
    );

    render(
      <LabelsPrintButton
        dateIso="2026-09-17"
        weekStart="2026-09-14"
        menuReleased={true}
        labelCount={2}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /print labels/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(/no menu is released/i);
  });
});
