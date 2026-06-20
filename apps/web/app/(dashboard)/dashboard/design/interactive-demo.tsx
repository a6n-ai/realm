"use client";

import { useState } from "react";
import {
  FilterBar,
  FilterPill,
  Pagination,
  SearchInput,
  SectionCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ds";

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
