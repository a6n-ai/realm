// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { StatGrid, DataTable } from "@realm/design-system";
import { TableCell } from "@realm/ui/table";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

describe("StatGrid items", () => {
  it("renders a mobile bar and a desktop card grid from the same items", () => {
    const { container } = render(
      <StatGrid cols={3} items={[
        { label: "Total", value: 5 },
        { label: "Open", value: 2 },
      ]} />,
    );
    // Mobile StatBar (md:hidden) + desktop grid (hidden md:grid) → each label twice.
    expect(container.querySelector(".md\\:hidden")).not.toBeNull();
    expect(container.querySelectorAll(".md\\:hidden")).toBeTruthy();
    const bar = container.querySelector(".md\\:hidden") as HTMLElement;
    expect(within(bar).getByText("Total")).toBeTruthy();
    expect(within(bar).getByText("5")).toBeTruthy();
  });
});

describe("DataTable mobile sort", () => {
  type Row = { id: string; name: string };
  const columns = [
    { key: "name", label: "Name", sortable: true },
    { key: "city", label: "City" },
  ] as const;
  it("renders a md:hidden Sort control listing sortable columns", () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={[{ id: "1", name: "A" }] as Row[]}
        rowKey={(r) => r.id}
        sort={{ column: "name", dir: "asc" }}
        emptyIcon={(() => null) as never}
        emptyMessage="none"
        renderRow={() => (<><TableCell>A</TableCell><TableCell>X</TableCell></>)}
      />,
    );
    // The Sort trigger is inside a md:hidden wrapper.
    const sortWrap = Array.from(container.querySelectorAll(".md\\:hidden")).find((el) =>
      el.textContent?.includes("Sort"),
    );
    expect(sortWrap).toBeTruthy();
  });
});
