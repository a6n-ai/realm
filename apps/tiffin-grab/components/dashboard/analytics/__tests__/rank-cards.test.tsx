// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { RankCards } from "../rank-cards";

beforeAll(() => {
  Element.prototype.getAnimations = () => [];
  Element.prototype.checkVisibility = () => true;
});

afterEach(cleanup);

describe("RankCards hover hint", () => {
  it("makes the link the hover trigger, so the portalled tip is never inside it", async () => {
    render(<RankCards items={[{ rank: 1, title: "Paneer Bowl", value: "12", href: "/dashboard/products/1" }]} />);
    expect(document.querySelector('a[data-slot="tooltip-trigger"]')).not.toBeNull();
  });
});
