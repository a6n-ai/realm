// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuleForm, emptyDraft, type Draft } from "../rule-builder";

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ flushdb: vi.fn().mockResolvedValue("OK") }),
}));

afterEach(cleanup);

describe("RuleForm", () => {
  const dummyProps = {
    dishes: [
      { publicId: "dish-1", label: "Butter Chicken" },
      { publicId: "dish-2", label: "Paneer Tikka" },
    ],
    diets: [
      { publicId: "diet-1", label: "Vegetarian" },
      { publicId: "diet-2", label: "Non-Vegetarian" },
    ],
    categories: [
      { key: "sabzi", label: "Sabzi" },
      { key: "dal", label: "Dal" },
    ],
    mealSizes: [
      { publicId: "size-1", label: "Standard" },
    ],
    plans: [
      { publicId: "plan-1", label: "Standard Plan" },
    ],
  };

  it("renders the 3 distinct action cards in the THEN section", () => {
    let draft: Draft = emptyDraft();
    const setDraft = vi.fn((d: Draft) => {
      draft = d;
    });

    render(
      <RuleForm
        draft={draft}
        setDraft={setDraft}
        {...dummyProps}
      />
    );

    // Verify the 3 action cards exist
    expect(screen.getByRole("radio", { name: /Limit Quantity/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Disallow Dishes/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Cannot Combine/i })).toBeInTheDocument();

    // Verify "Limit Quantity" is initially selected
    expect(screen.getByRole("radio", { name: /Limit Quantity/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText(/Maximum dishes/i)).toBeInTheDocument();
  });

  it("switches to 'forbid' when clicking Disallow Dishes card", () => {
    let draft: Draft = emptyDraft();
    const setDraft = vi.fn((d: Draft) => {
      draft = d;
    });

    const { rerender } = render(
      <RuleForm
        draft={draft}
        setDraft={setDraft}
        {...dummyProps}
      />
    );

    const forbidButton = screen.getByRole("radio", { name: /Disallow Dishes/i });
    fireEvent.click(forbidButton);

    expect(setDraft).toHaveBeenCalled();
    const lastCall = setDraft.mock.calls[setDraft.mock.calls.length - 1]![0];
    expect(lastCall.action).toBe("forbid");

    // Re-render with new draft
    rerender(
      <RuleForm
        draft={lastCall}
        setDraft={setDraft}
        {...dummyProps}
      />
    );

    expect(screen.getByText(/Completely blocked:/i)).toBeInTheDocument();
  });

  it("switches to 'cannot_coexist' when clicking Cannot Combine card", () => {
    let draft: Draft = emptyDraft();
    const setDraft = vi.fn((d: Draft) => {
      draft = d;
    });

    const { rerender } = render(
      <RuleForm
        draft={draft}
        setDraft={setDraft}
        {...dummyProps}
      />
    );

    const coexistButton = screen.getByRole("radio", { name: /Cannot Combine/i });
    fireEvent.click(coexistButton);

    expect(setDraft).toHaveBeenCalled();
    const lastCall = setDraft.mock.calls[setDraft.mock.calls.length - 1]![0];
    expect(lastCall.action).toBe("cannot_coexist");

    // Re-render with new draft
    rerender(
      <RuleForm
        draft={lastCall}
        setDraft={setDraft}
        {...dummyProps}
      />
    );

    expect(screen.getAllByText(/Mutually exclusive:/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Customers can choose from this pool/i)).toBeInTheDocument();
  });

  it("renders live customer preview card", () => {
    const draft: Draft = {
      ...emptyDraft(),
      name: "Sabzi limit",
    };

    render(
      <RuleForm
        draft={draft}
        setDraft={vi.fn()}
        {...dummyProps}
      />
    );

    expect(screen.getByText(/Customer Preview/i)).toBeInTheDocument();
  });
});
