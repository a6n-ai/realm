"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { FilterBar, SearchInput } from "@/components/ds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { eventLabel } from "./template-status";

export interface TemplateStatus {
  event: string;
  emailLocales: string[];
  inAppLocales: string[];
  updatedAt: number | null;
}

type Filter = "all" | "email" | "in_app" | "missing";

function LocaleCell({ locales }: { locales: string[] }) {
  if (locales.length === 0) return <span className="text-xs text-muted-foreground">Not set</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {locales.map((l) => (
        <span key={l} className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {l}
        </span>
      ))}
    </span>
  );
}

function fmt(ms: number | null): string {
  return ms ? new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "—";
}

export function TemplateList({ items }: { items: TemplateStatus[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !eventLabel(i.event).toLowerCase().includes(q) && !i.event.includes(q)) return false;
      if (filter === "email") return i.emailLocales.length > 0;
      if (filter === "in_app") return i.inAppLocales.length > 0;
      if (filter === "missing") return i.emailLocales.length === 0 && i.inAppLocales.length === 0;
      return true;
    });
  }, [items, query, filter]);

  return (
    <div className="space-y-4">
      <FilterBar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search events…" />}
        filters={
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="email">Has email</SelectItem>
              <SelectItem value="in_app">Has in-app</SelectItem>
              <SelectItem value="missing">Not configured</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>In-app</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  No events match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i) => (
                <TableRow
                  key={i.event}
                  onClick={() => router.push(`/dashboard/notifications/templates/${i.event}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium">{eventLabel(i.event)}</TableCell>
                  <TableCell><LocaleCell locales={i.emailLocales} /></TableCell>
                  <TableCell><LocaleCell locales={i.inAppLocales} /></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{fmt(i.updatedAt)}</TableCell>
                  <TableCell><ChevronRightIcon className="size-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
