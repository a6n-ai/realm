// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HomeIcon, PlusIcon } from "lucide-react";
import { BottomNav } from "@realm/design-system";
afterEach(cleanup);
describe("BottomNav", () => {
  const items = [
    { title: "Overview", href: "/dashboard", icon: HomeIcon, active: true },
    { title: "Orders", href: "/dashboard/orders", icon: HomeIcon, active: false },
  ];
  it("renders a tab per item, marks active with aria-current, and renders the FAB", () => {
    const { container, getByText } = render(
      <BottomNav items={items} fab={{ label: "New", icon: PlusIcon, href: "/dashboard/orders?new=1" }} />,
    );
    expect(getByText("Overview")).toBeTruthy();
    expect(container.querySelector('[aria-current="page"]')).toBeTruthy();
    expect(container.querySelector('a[href="/dashboard/orders?new=1"]')).toBeTruthy();
  });
});
