"use client";

import { useState } from "react";
import { UsersIcon } from "lucide-react";
import { TableCell } from "@realm/ui/table";
import {
  DataTable,
  FilterBar,
  FilterPill,
  Pagination,
  SearchInput,
  SectionCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type Column,
} from "@/components/ds";

type DemoRow = { id: string; name: string; role: string; orders: number };

const DEMO_COLUMNS: readonly Column<"name" | "role" | "orders">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "role", label: "Role" },
  { key: "orders", label: "Orders", sortable: true, align: "right" },
];

const DEMO_ROWS: DemoRow[] = [
  { id: "1", name: "Aditi Rao", role: "Customer", orders: 12 },
  { id: "2", name: "Ben Carter", role: "Customer", orders: 3 },
  { id: "3", name: "Chen Wei", role: "Lead", orders: 0 },
];

const FILTERS = [
  { label: "All", count: 24 },
  { label: "Active", count: 18 },
  { label: "Pending", count: 4 },
  { label: "Closed", count: 2 },
];

export function InteractiveDemo() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(2);

  return (
    <div className="space-y-6">
      <SectionCard title="Filter bar" subtitle="SearchInput + FilterPills with active state and counts">
        <FilterBar
          search={<SearchInput value={search} onChange={setSearch} placeholder="Search inquiries…" />}
          filters={FILTERS.map((f) => (
            <FilterPill
              key={f.label}
              label={f.label}
              count={f.count}
              active={activeFilter === f.label}
              onClick={() => setActiveFilter(f.label)}
            />
          ))}
        />
      </SectionCard>

      <SectionCard title="Data table" subtitle="DataTable — bordered card, URL search, sortable headers, in-table empty state">
        <DataTable
          columns={DEMO_COLUMNS}
          rows={DEMO_ROWS}
          rowKey={(r) => r.id}
          sort={{ column: "orders", dir: "desc" }}
          search={{ placeholder: "Search people…", keys: ["name", "role"] }}
          emptyIcon={UsersIcon}
          emptyMessage="No people yet."
          renderRow={(r) => (
            <>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.role}</TableCell>
              <TableCell className="text-right tabular-nums">{r.orders}</TableCell>
            </>
          )}
        />
      </SectionCard>

      <SectionCard title="Tabs" subtitle="Tabbed content navigation">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p className="text-muted-foreground py-4 text-sm">Overview tab content goes here.</p>
          </TabsContent>
          <TabsContent value="details">
            <p className="text-muted-foreground py-4 text-sm">Details tab content goes here.</p>
          </TabsContent>
          <TabsContent value="history">
            <p className="text-muted-foreground py-4 text-sm">History tab content goes here.</p>
          </TabsContent>
        </Tabs>
      </SectionCard>

      <SectionCard title="Pagination" subtitle="Page controls with prev/next and page numbers">
        <div className="flex items-center justify-center py-2">
          <Pagination page={page} pageCount={8} onPage={setPage} />
        </div>
      </SectionCard>
    </div>
  );
}
