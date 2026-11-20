// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SwitchList } from "./switch-list";

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

describe("SwitchList", () => {
  it("renders a row tooltip beside its label, not inside it", () => {
    const { container } = render(
      <SwitchList
        rows={[{ id: "a", label: "Alerts", checked: false, disabled: true, tooltip: "Managed by the owner", onChange: () => {} }]}
      />
    );
    const content = container.querySelector('[data-slot="tooltip-content"]');
    expect(content).toHaveTextContent("Managed by the owner");
    expect(content!.closest("button,label")).toBeNull();
  });
});
