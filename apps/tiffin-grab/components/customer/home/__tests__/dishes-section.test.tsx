// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
  Pressable: ({ children, ...p }: { children: React.ReactNode } & Record<string, unknown>) => <button {...(p as object)}>{children}</button>,
  LottieEmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { DishesSection } from "../dishes-section";

const dishes = [{ publicId: "dsh_1", name: "Paneer", description: "Creamy", diet: "veg", image: { url: "/api/files/p.jpg", filePath: "p", fileName: "p", type: "image/jpeg", size: 1 }, category: "sabzi" }] as never;

afterEach(cleanup);

describe("DishesSection", () => {
  it("renders dish cards and opens the modal", () => {
    render(<DishesSection dishes={dishes} />);
    fireEvent.click(screen.getByText("Paneer"));
    expect(screen.getByText(/Creamy/)).toBeInTheDocument(); // modal description
  });
  it("empty state when no dishes", () => {
    render(<DishesSection dishes={[]} />);
    expect(screen.getByText(/no dishes/i)).toBeInTheDocument();
  });
});
