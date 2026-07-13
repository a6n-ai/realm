// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  return { ...actual, useReducedMotion: () => false };
});

import { Pressable } from "../pressable";

afterEach(cleanup);

describe("Pressable", () => {
  it("renders as a button with its children and forwards onClick", () => {
    const onClick = vi.fn();
    render(<Pressable onClick={onClick}>Tap me</Pressable>);
    const btn = screen.getByRole("button", { name: "Tap me" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
