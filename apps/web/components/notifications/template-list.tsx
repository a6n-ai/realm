"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { FilterBar, RowActionButton, RowActions, SearchInput } from "@/components/ds";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { eventLabel } from "./template-status";

export interface TemplateChannel {
  channel: string;
  locales: string[];
}
export interface TemplateStatus {
  event: string;
  channels: TemplateChannel[];
  updatedAt: number | null;
}

/** Display names per channel. Unknown/future channels fall back to a humanized label. */
const CHANNEL_LABEL: Record<string, string> = { email: "Email", in_app: "In-app", sms: "SMS", whatsapp: "WhatsApp" };
const label = (c: string) => CHANNEL_LABEL[c] ?? c.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());

type Filter = "all" | "configured" | "missing";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "configured", label: "Configured" },
  { key: "missing", label: "Not configured" },
];

function ChannelsCell({ channels }: { channels: TemplateChannel[] }) {
  if (channels.length === 0) return <span className="text-xs text-muted-foreground">Not configured</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {channels.map((c) => (
        <span
          key={c.channel}
          className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs"
        >
          {label(c.channel)}
          <span className="font-mono text-[10px] uppercase text-muted-foreground">{c.locales.join("·")}</span>
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
      if (filter === "configured") return i.channels.length > 0;
      if (filter === "missing") return i.channels.length === 0;
      return true;
    });
  }, [items, query, filter]);

  return (
    <div className="space-y-4">
      <FilterBar
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search events…" />}
        filters={
          <div className="bg-muted/50 inline-flex items-center rounded-lg border p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  filter === f.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  No events match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((i) => {
                const href = `/dashboard/notifications/templates/${i.event}`;
                return (
                  <TableRow key={i.event} onClick={() => router.push(href)} className="group/row cursor-pointer">
                    <TableCell className="font-medium">{eventLabel(i.event)}</TableCell>
                    <TableCell><ChannelsCell channels={i.channels} /></TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{fmt(i.updatedAt)}</TableCell>
                    <TableCell>
                      <RowActions>
                        <RowActionButton icon={PencilIcon} label="Edit templates" href={href} />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
