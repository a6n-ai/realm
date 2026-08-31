// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ResponsiveDialog } from "@foundry/design-system";
vi.mock("@foundry/ui/use-mobile", () => ({ useIsMobile: () => false }));
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

  it("keeps desktop Dialog when direction is bottom", () => {
    const { getByText } = render(
      <ResponsiveDialog open title="Vacation" direction="bottom" onOpenChange={() => {}}>
        <p>dates</p>
      </ResponsiveDialog>,
    );
    expect(getByText("Vacation")).toBeTruthy();
    expect(getByText("dates")).toBeTruthy();
  });

  it("ignores nested on desktop Dialog", () => {
    const { getByText } = render(
      <ResponsiveDialog open nested handleOnly title="Pick a date" direction="bottom" onOpenChange={() => {}}>
        <p>calendar</p>
      </ResponsiveDialog>,
    );
    expect(getByText("Pick a date")).toBeTruthy();
    expect(getByText("calendar")).toBeTruthy();
  });
});
