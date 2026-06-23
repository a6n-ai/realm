// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PinSection } from "../pin-section";

vi.mock("../actions", () => ({ setMyPin: vi.fn(), removeMyPin: vi.fn() }));

describe("PinSection", () => {
  it("offers to set a PIN when none exists", () => {
    render(<PinSection hasPin={false} />);
    expect(screen.getByRole("button", { name: /set pin/i })).toBeDefined();
  });

  it("offers to update/remove when a PIN exists", () => {
    render(<PinSection hasPin />);
    expect(screen.getByRole("button", { name: /update pin/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /remove pin/i })).toBeDefined();
  });
});
