// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextItemEmpty, scopeHint } from "./next-item-parts";

afterEach(cleanup);

describe("NextItemEmpty", () => {
  it("shows the title, the detail and its links", () => {
    render(<NextItemEmpty title="All clear" detail="0 upcoming"><a href="/x">Go</a></NextItemEmpty>);
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.getByText("0 upcoming")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go" })).toBeInTheDocument();
  });
});

describe("scopeHint", () => {
  it("names the queue by owner", () => {
    const options = [{ value: "s1", label: "Sam", href: "/x" }];
    expect(scopeHint("me", options)).toBe("Your queue");
    expect(scopeHint("all", options)).toBe("All owners");
    expect(scopeHint("s1", options)).toBe("Sam's queue");
  });
});
