// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { RunningPlansField } from "../order-sections";

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.checkVisibility = () => true;
  document.head.append(
    Object.assign(document.createElement("style"), {
      textContent: "[popover] { display: block !important }",
    })
  );
});

afterEach(cleanup);

const plan = {
  publicId: "p1",
  deploymentId: "D-1",
  mealSize: "Large",
  status: "active",
  startDate: "2026-11-01",
  lastDay: "2026-12-01",
  tiffinCount: 20,
};

describe("RunningPlansField", () => {
  it("renders the plan tooltip beside its button, not inside it", () => {
    const { container } = render(
      <RunningPlansField plans={[plan]} selectedId={null} busyId={null} onPick={() => {}} />
    );
    const content = container.querySelector('[data-slot="tooltip-content"]');
    expect(content).toHaveTextContent("Large");
    expect(content!.closest("button,label")).toBeNull();
  });
});
