// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { HomeIcon, MenuIcon } from "lucide-react";
import { BottomNav, type BottomNavItem } from "@realm/design-system";
afterEach(cleanup);
describe("BottomNav", () => {
  it("renders link + action items, marks active with aria-current, and fires the FAB", () => {
    const onMore = vi.fn();
    const onFab = vi.fn();
    const items: BottomNavItem[] = [
      { title: "Overview", href: "/dashboard", icon: HomeIcon, active: true },
      { title: "Orders", href: "/dashboard/orders", icon: HomeIcon, active: false },
      { title: "More", icon: MenuIcon, active: true, onClick: onMore },
    ];
    const { container, getByText, getByLabelText } = render(
      <BottomNav items={items} onFabClick={onFab} fabLabel="Create" fabCaption="New" />,
    );
    expect(getByText("New")).toBeTruthy();
    expect(getByText("Overview")).toBeTruthy();
    // link item stays an <a>; active gets aria-current
    expect(container.querySelector('a[href="/dashboard"][aria-current="page"]')).toBeTruthy();
    // the More action item renders a <button> with aria-current when active
    const more = getByText("More").closest("button");
    expect(more).toBeTruthy();
    expect(more?.getAttribute("aria-current")).toBe("page");
    fireEvent.click(more!);
    expect(onMore).toHaveBeenCalledTimes(1);
    // FAB is a button
    const fab = getByLabelText("Create");
    expect(fab.tagName).toBe("BUTTON");
    fireEvent.click(fab);
    expect(onFab).toHaveBeenCalledTimes(1);
  });
});
