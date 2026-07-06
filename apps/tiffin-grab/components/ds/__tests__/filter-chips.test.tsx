// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { FilterChips } from "@realm/design-system";
afterEach(cleanup);
describe("FilterChips", () => {
  it("is a single no-wrap horizontally scrollable row", () => {
    const { container } = render(<FilterChips><button>All</button></FilterChips>);
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain("overflow-x-auto");
    expect(row.className).toContain("flex-nowrap");
  });
});
