// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogTabs } from "../catalog-tabs";
import { ResourceEditor } from "../../[resource]/resource-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/catalog/dishes",
  useSearchParams: () => new URLSearchParams(),
}));

// jsdom has no Pointer Capture API; Radix's Tabs (RovingFocusGroup) calls it
// on activation and throws without this stub.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// Radix's Tabs activates on focus (default "automatic" activationMode), and
// jsdom's fireEvent.click doesn't move focus the way a real browser click does.
function clickTab(el: HTMLElement) {
  fireEvent.pointerDown(el, { pointerId: 1, button: 0 });
  el.focus();
  fireEvent.focus(el);
  fireEvent.click(el);
}
vi.mock("@/app/(dashboard)/dashboard/catalog/actions", () => ({
  saveItem: vi.fn(), retireItem: vi.fn(), reactivateItem: vi.fn(),
}));

afterEach(cleanup);

const dishRows = [
  { publicId: "dish_1", name: "Paneer Tikka", diet: "veg", category: "sabzi", description: null, image: null, active: true },
];
const categoryRows = [
  { publicId: "cat_1", key: "sabzi", label: "Sabzi", planType: "tiffin", selectable: true, sortOrder: 1, active: true },
];

describe("CatalogTabs", () => {
  it("renders a Dishes tab and a Categories tab, defaulting to Dishes", () => {
    render(
      <CatalogTabs
        dishes={<ResourceEditor resource="dishes" rows={dishRows} dynamicOptions={{}} sort={{ column: "name", dir: "asc" }} />}
        categories={<ResourceEditor resource="dish-categories" rows={categoryRows} dynamicOptions={{}} sort={{ column: "label", dir: "asc" }} />}
      />,
    );

    expect(screen.getByRole("tab", { name: "Dishes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getAllByText("Paneer Tikka").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sabzi")).not.toBeInTheDocument();
  });

  it("switches to the Categories tab's editor on click", () => {
    render(
      <CatalogTabs
        dishes={<ResourceEditor resource="dishes" rows={dishRows} dynamicOptions={{}} sort={{ column: "name", dir: "asc" }} />}
        categories={<ResourceEditor resource="dish-categories" rows={categoryRows} dynamicOptions={{}} sort={{ column: "label", dir: "asc" }} />}
      />,
    );

    clickTab(screen.getByRole("tab", { name: "Categories" }));
    expect(screen.getAllByText("Sabzi").length).toBeGreaterThan(0);
  });
});
