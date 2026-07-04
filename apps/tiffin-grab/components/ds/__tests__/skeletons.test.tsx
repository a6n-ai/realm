// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SkeletonStatCards, SkeletonTable, SkeletonFilterBar, SkeletonCardGrid } from "../skeletons";

afterEach(cleanup);

const skeletons = (c: HTMLElement) => c.querySelectorAll('[data-slot="skeleton"]');

describe("skeleton primitives", () => {
  it("SkeletonStatCards renders one card per count", () => {
    const { container } = render(<SkeletonStatCards count={4} />);
    // each card = 2 skeletons (label + value)
    expect(skeletons(container).length).toBe(8);
  });

  it("SkeletonTable renders columns × (rows + header)", () => {
    const { container } = render(<SkeletonTable columns={5} rows={3} />);
    expect(container.querySelectorAll("th").length).toBe(5);
    expect(container.querySelectorAll("tbody tr").length).toBe(3);
    expect(container.querySelectorAll("tbody td").length).toBe(15);
  });

  it("SkeletonFilterBar renders a pill per count plus the search input", () => {
    const { container } = render(<SkeletonFilterBar pills={7} dropdown />);
    // 1 search + 7 pills + 1 dropdown
    expect(skeletons(container).length).toBe(9);
  });

  it("SkeletonCardGrid renders one card per count", () => {
    const { container } = render(<SkeletonCardGrid count={3} />);
    expect(skeletons(container).length).toBe(3);
  });
});
