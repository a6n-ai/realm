// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ResponsiveDialog } from "@realm/design-system";
vi.mock("@realm/ui/use-mobile", () => ({ useIsMobile: () => false }));
afterEach(cleanup);
describe("ResponsiveDialog", () => {
  it("renders desktop Dialog content when open", () => {
    const { getByText } = render(
      <ResponsiveDialog open title="Create" onOpenChange={() => {}}>
        <p>body</p>
      </ResponsiveDialog>,
    );
    expect(getByText("Create")).toBeTruthy();
    expect(getByText("body")).toBeTruthy();
  });
});
