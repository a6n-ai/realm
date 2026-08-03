"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Card } from "@realm/design-system";
import { Button } from "@realm/ui/button";
import { cn } from "@realm/ui/cn";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@realm/ui/collapsible";
import type { SyncResult } from "@/lib/sync/menu-sync.service";

type Tone = "ok" | "warn" | "bad" | "muted";

const STAT_META: Record<string, { label: string; tone: Tone }> = {
  added: { label: "Added", tone: "ok" },
  imagesUpdated: { label: "Photos updated", tone: "ok" },
  fieldsUpdated: { label: "Details updated", tone: "ok" },
  unchanged: { label: "Unchanged", tone: "muted" },
  skippedNotInClover: { label: "Not in Clover (skipped)", tone: "warn" },
  duplicates: { label: "Duplicates to resolve", tone: "warn" },
  categoryIssues: { label: "Category issues", tone: "bad" },
  errors: { label: "Errors", tone: "bad" },
};

const toneValue: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  muted: "text-foreground",
};

export function SyncSummary({ result }: { result: SyncResult }) {
  const stats: { key: string; count: number; items: string[] }[] = [
    { key: "added", count: result.added.length, items: result.added.map((i) => i.name) },
    {
      key: "imagesUpdated",
      count: result.imagesUpdated.length,
      items: result.imagesUpdated.map((i) => i.name),
    },
    {
      key: "fieldsUpdated",
      count: result.fieldsUpdated.length,
      // Name the fields that moved — "Butter Chicken (price, description)" is
      // reviewable in a way that a bare count is not.
      items: result.fieldsUpdated.map((i) => `${i.name} (${i.changed.join(", ")})`),
    },
    { key: "unchanged", count: result.unchangedCount, items: [] },
    {
      key: "skippedNotInClover",
      count: result.skippedNotInClover.length,
      items: result.skippedNotInClover.map((i) => `${i.name} (${i.rawCategory})`),
    },
    {
      key: "duplicates",
      count: result.duplicates.length,
      items: result.duplicates.map((d) => d.incoming.name),
    },
    {
      key: "categoryIssues",
      count: result.categoryIssues.reduce((n, c) => n + c.items.length, 0),
      items: result.categoryIssues.flatMap((c) =>
        c.items.map((name) => `${name} (${c.rawCategory})`),
      ),
    },
    {
      key: "errors",
      count: result.errors.length,
      items: result.errors.map((e) => `${e.item}: ${e.message}`),
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {stats.map((s) => (
        <StatRow
          key={s.key}
          label={STAT_META[s.key].label}
          tone={STAT_META[s.key].tone}
          count={s.count}
          items={s.items}
        />
      ))}
    </div>
  );
}

function StatRow({
  label,
  tone,
  count,
  items,
}: {
  label: string;
  tone: Tone;
  count: number;
  items: string[];
}) {
  const [open, setOpen] = useState(false);
  const expandable = items.length > 0;

  return (
    <Card className="gap-0 p-3 sm:p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p
        className={cn(
          "nums mt-2 text-xl font-semibold tabular-nums sm:text-2xl",
          count > 0 && toneValue[tone],
        )}
      >
        {count}
      </p>

      {expandable ? (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 w-full justify-between px-0"
            >
              {open ? "Hide items" : `Show ${items.length} item${items.length === 1 ? "" : "s"}`}
              <ChevronDownIcon
                className={cn("size-3.5 transition-transform", open && "rotate-180")}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
              {items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </Card>
  );
}
