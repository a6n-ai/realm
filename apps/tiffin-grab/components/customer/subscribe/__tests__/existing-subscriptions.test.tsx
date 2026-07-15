// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/motion", () => ({
  Reveal: Object.assign(({ children }: { children: React.ReactNode }) => <div>{children}</div>, { Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
}));
import { ExistingSubscriptions } from "../existing-subscriptions";
const mk = (status: string, name: string) => ({ publicId: name, planName: name, mealSizeName: "Medium", daysPerWeek: 5, status, createdAt: 1 });
afterEach(cleanup);
describe("ExistingSubscriptions", () => {
  it("groups current vs past and renders rows", () => {
    render(<ExistingSubscriptions subs={[mk("active", "Veg"), mk("cancelled", "Old")] as never} />);
    expect(screen.getByText(/already have/i)).toBeInTheDocument();
    expect(screen.getByText(/Past subscriptions/i)).toBeInTheDocument();
    expect(screen.getByText(/Veg/)).toBeInTheDocument();
    expect(screen.getByText(/Old/)).toBeInTheDocument();
  });
  it("renders nothing when empty", () => {
    const { container } = render(<ExistingSubscriptions subs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
