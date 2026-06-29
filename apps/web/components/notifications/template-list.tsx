"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TemplateRow, eventLabel } from "./template-status";

export interface TemplateStatus {
  event: string;
  email: boolean;
  inApp: boolean;
}

export function TemplateList({ items }: { items: TemplateStatus[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => eventLabel(i.event).toLowerCase().includes(q) || i.event.includes(q));
  }, [items, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events…"
          className="pl-9"
          aria-label="Search notification events"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No events match “{query}”.
        </p>
      ) : (
        <div className="divide-y overflow-hidden rounded-lg border">
          {filtered.map((i) => (
            <TemplateRow key={i.event} event={i.event} email={i.email} inApp={i.inApp} />
          ))}
        </div>
      )}
    </div>
  );
}
