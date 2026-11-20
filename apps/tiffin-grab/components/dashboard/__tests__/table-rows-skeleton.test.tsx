// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { FacetDef } from "@foundry/design-system";
import { afterEach, describe, expect, it } from "vitest";
import { TableRowsSkeleton, pinnedFacetLabels } from "../table-rows-skeleton";

afterEach(cleanup);

const COLUMNS = [
  { key: "name", label: "Customer" },
  { key: "status", label: "Status", align: "center" },
  { key: "total", label: "Total", align: "right" },
  { key: "actions", label: "", width: "w-10" },
] as const;

describe("TableRowsSkeleton", () => {
  it("renders the real column headers as th text", () => {
    render(<TableRowsSkeleton columns={COLUMNS} />);
    for (const label of ["Customer", "Status", "Total"]) {
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
    }
  });

  it("renders N skeleton rows", () => {
    const { container } = render(<TableRowsSkeleton columns={COLUMNS} rows={4} />);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("stacks two bars in the first text column and one placeholder elsewhere", () => {
    const { container } = render(<TableRowsSkeleton columns={COLUMNS} rows={1} serial={false} firstColumnLines={2} />);
    const cells = Array.from(container.querySelectorAll("tbody td"));
    expect(cells[0].querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2);
    expect(cells[1].querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
    expect(cells[2].querySelector(".ml-auto")).not.toBeNull();
  });

  it("shows the search placeholder when given", () => {
    render(<TableRowsSkeleton columns={COLUMNS} search="Search orders" />);
    expect(screen.getByPlaceholderText("Search orders")).toBeDisabled();
  });

  it("renders the filter bar closed: Add Filter plus the facet labels", () => {
    render(<TableRowsSkeleton columns={COLUMNS} search="Search orders" filters={["Source", "Plan"]} />);
    expect(screen.getByPlaceholderText("Search orders")).toBeDisabled();
    expect(screen.getByRole("button", { name: /add filter/i })).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
  });

  it("shows only Add Filter when the table pins no facets", () => {
    render(<TableRowsSkeleton columns={COLUMNS} filters={[]} />);
    expect(screen.getByRole("button", { name: /add filter/i })).toBeInTheDocument();
  });

  it("stacks one bar in the first text column by default", () => {
    const { container } = render(<TableRowsSkeleton columns={COLUMNS} rows={1} serial={false} />);
    const cells = Array.from(container.querySelectorAll("tbody td"));
    expect(cells[0].querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
  });

  it("marks itself busy", () => {
    const { container } = render(<TableRowsSkeleton columns={COLUMNS} />);
    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
  });
});

describe("pinnedFacetLabels", () => {
  const spec: FacetDef[] = [
    { kind: "dateRange", field: "d", label: "Joined" },
    { kind: "select", field: "a", label: "A", options: [] },
    { kind: "search", fields: ["q"] },
    { kind: "multi", field: "b", label: "B", options: [] },
    { kind: "pills", field: "c", label: "C", options: [] },
    { kind: "select", field: "e", label: "E", options: [] },
  ];

  it("mirrors ListSearchFilters: first three non-search facets, date hidden when external", () => {
    expect(pinnedFacetLabels(spec, "external")).toEqual(["A", "B", "C"]);
    expect(pinnedFacetLabels(spec)).toEqual(["Joined", "A", "B"]);
  });
});
