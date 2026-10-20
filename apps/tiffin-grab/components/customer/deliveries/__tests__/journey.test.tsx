// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Journey } from "../trip-parts";

afterEach(cleanup);

describe("Journey", () => {
  it("delivery day without a route push stays on Scheduled", () => {
    render(<Journey status="unconfirmed" />);
    expect(screen.getByRole("img", { name: "Scheduled delivery" })).toBeInTheDocument();
  });
  it("delivery day with a route push is On the way", () => {
    render(<Journey status="unconfirmed" pushed />);
    expect(screen.getByRole("img", { name: "On the way delivery" })).toBeInTheDocument();
  });
  it("a push before the delivery day does not move it", () => {
    render(<Journey status="cutoff-passed" pushed />);
    expect(screen.getByRole("img", { name: "Scheduled delivery" })).toBeInTheDocument();
  });
});
