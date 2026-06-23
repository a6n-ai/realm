// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PinSection } from "../pin-section";

vi.mock("../actions", () => ({ setMyPin: vi.fn(), removeMyPin: vi.fn() }));

afterEach(cleanup);

describe("PinSection", () => {
  it("offers to set a PIN, with no remove option, when none exists", () => {
    render(<PinSection hasPin={false} />);
    expect(screen.getByRole("button", { name: /set pin/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /remove pin/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /update pin/i })).toBeNull();
  });

  it("offers to update and remove when a PIN exists", () => {
    render(<PinSection hasPin />);
    expect(screen.getByRole("button", { name: /update pin/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove pin/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^set pin$/i })).toBeNull();
  });
});
