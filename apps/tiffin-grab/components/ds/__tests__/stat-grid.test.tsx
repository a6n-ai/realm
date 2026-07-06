// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { StatGrid } from "@realm/design-system";
afterEach(cleanup);
describe("StatGrid", () => {
  it("is 2-up on mobile and lg:cols at large width", () => {
    const { container } = render(<StatGrid cols={4}><div/><div/></StatGrid>);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("lg:grid-cols-4");
  });
});
