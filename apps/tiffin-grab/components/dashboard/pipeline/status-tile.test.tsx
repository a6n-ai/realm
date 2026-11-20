// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { PipelinePill } from "./status-tile";

afterEach(cleanup);

describe("PipelinePill", () => {
  it("is a plain badge with no tooltip, even inside a button", () => {
    const { container } = render(
      <button type="button">
        <PipelinePill icon={Inbox} pill="" label="New" />
      </button>,
    );
    expect(container.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
    expect(container.querySelector("button button")).toBeNull();
  });
});
