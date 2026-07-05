// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import { DataTable } from "@realm/design-system";
import { TableCell } from "@realm/ui/table";

// DataTable reads "q" URL state via next/navigation hooks; stub them for jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
  usePathname: () => "/x",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

type Row = { id: string; name: string; city: string };
const rows: Row[] = [{ id: "TG-1", name: "Anna", city: "Toronto" }];
const columns = [
  { key: "name", label: "Name" },
  { key: "city", label: "City" },
  { key: "chevron", label: "", width: "w-8" },
] as const;

function Harness() {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      idAccessor={(r) => r.id}
      idHref={(r) => `/x/${r.id}`}
      emptyIcon={(() => null) as never}
      emptyMessage="none"
      renderRow={(r) => (
        <>
          <TableCell>{r.name}</TableCell>
          <TableCell>{r.city}</TableCell>
          <TableCell><span data-testid="chev">›</span></TableCell>
        </>
      )}
    />
  );
}

describe("DataTable mobile card", () => {
  it("derives a card: id, title from first column, label:value for the rest, skips empty-label cols", () => {
    const { container } = render(<Harness />);
    const card = container.querySelector(".md\\:hidden");
    expect(card).not.toBeNull();
    const scope = within(card as HTMLElement);
    expect(scope.getByText("TG-1")).toBeTruthy();     // id line
    expect(scope.getByText("Anna")).toBeTruthy();     // title (col 0)
    expect(scope.getByText("City")).toBeTruthy();     // label of col 1
    expect(scope.getByText("Toronto")).toBeTruthy();  // value of col 1
    // empty-label chevron column is NOT rendered as a label:value row
    expect(scope.queryByText("chevron")).toBeNull();
    // stretched link to the row href
    expect((card as HTMLElement).querySelector('a[href="/x/TG-1"]')).toBeTruthy();
  });
});
