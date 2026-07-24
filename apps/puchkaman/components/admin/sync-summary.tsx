"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { SyncResult } from "@/lib/sync/menu-sync.service";

const STAT_STYLE: Record<string, { bg: string; label: string }> = {
  added: { bg: "var(--mint)", label: "Added" },
  updatesAvailable: { bg: "var(--yellow)", label: "Updates available" },
  imagesUpdated: { bg: "var(--mint)", label: "Photos updated" },
  unchanged: { bg: "var(--cream)", label: "Unchanged" },
  duplicates: { bg: "var(--pink)", label: "Duplicates to resolve" },
  categoryIssues: { bg: "var(--red)", label: "Category issues" },
  errors: { bg: "var(--red)", label: "Errors" },
};

export function SyncSummary({ result }: { result: SyncResult }) {
  const stats: { key: string; count: number; items: string[] }[] = [
    { key: "added", count: result.added.length, items: result.added.map((i) => i.name) },
    { key: "updatesAvailable", count: result.updatesAvailable.length, items: result.updatesAvailable.map((i) => i.name) },
    { key: "imagesUpdated", count: result.imagesUpdated.length, items: result.imagesUpdated.map((i) => i.name) },
    { key: "unchanged", count: result.unchangedCount, items: [] },
    { key: "duplicates", count: result.duplicates.length, items: result.duplicates.map((d) => d.incoming.name) },
    {
      key: "categoryIssues",
      count: result.categoryIssues.reduce((n, c) => n + c.items.length, 0),
      items: result.categoryIssues.flatMap((c) => c.items.map((name) => `${name} (${c.rawCategory})`)),
    },
    { key: "errors", count: result.errors.length, items: result.errors.map((e) => `${e.item}: ${e.message}`) },
  ];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {stats.map((s) => (
          <StatCard key={s.key} label={STAT_STYLE[s.key].label} bg={STAT_STYLE[s.key].bg} count={s.count} items={s.items} />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, bg, count, items }: { label: string; bg: string; count: number; items: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: 14, background: "var(--white)" }}>
      <div className="flex between center">
        <span className="display" style={{ fontSize: "1.6rem" }}>
          {count}
        </span>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: bg, border: "2px solid var(--ink)" }} />
      </div>
      <p className="mono" style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7, marginTop: 4 }}>
        {label}
      </p>
      {items.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex center"
            style={{ gap: 4, marginTop: 8, fontSize: "0.72rem", fontWeight: 700, opacity: 0.75 }}
          >
            {open ? "Hide" : "Show"} {open ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
          </button>
          {open && (
            <ul style={{ marginTop: 6, display: "grid", gap: 3, maxHeight: 140, overflowY: "auto" }}>
              {items.map((item, i) => (
                <li key={i} style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
