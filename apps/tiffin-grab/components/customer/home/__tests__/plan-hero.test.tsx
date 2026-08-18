// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlanHero } from "../plan-hero";

afterEach(cleanup);

describe("PlanHero", () => {
  it("renders the same brand-green banner regardless of plan identity — no per-key hue", () => {
    const { container: a } = render(<PlanHero planType="tiffin" />);
    const { container: b } = render(<PlanHero planType="tiffin" />);
    expect(a.firstElementChild?.className).toBe(b.firstElementChild?.className);
    expect(a.firstElementChild?.className).toContain("bg-primary");
  });

  it("picks a different icon per plan type but the same background", () => {
    const { container: tiffin } = render(<PlanHero planType="tiffin" />);
    const { container: healthy } = render(<PlanHero planType="healthy" />);
    expect(tiffin.querySelector("svg")?.outerHTML).not.toBe(healthy.querySelector("svg")?.outerHTML);
    expect(tiffin.firstElementChild?.className).toBe(healthy.firstElementChild?.className);
  });
});
