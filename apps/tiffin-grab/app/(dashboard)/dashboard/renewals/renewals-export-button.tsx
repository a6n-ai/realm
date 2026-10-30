"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { CUSTOMER_EXPORT_COLUMNS, PLAN_EXPORT_COLUMNS } from "./renewal-export-columns";

export function RenewalsExportButton() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const columns = tab === "customers" ? CUSTOMER_EXPORT_COLUMNS : PLAN_EXPORT_COLUMNS;
  const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => [...allKeys]);

  function openDialog(next: boolean) {
    if (next) setSelected([...allKeys]);
    setOpen(next);
  }

  function toggle(key: string, on: boolean) {
    setSelected((prev) => (on ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key)));
  }

  function download() {
    if (selected.length === 0) return;
    const qs = new URLSearchParams(searchParams.toString());
    qs.delete("page");
    qs.delete("size");
    // Keep the column order from the catalog, not checkbox click order.
    const ordered = allKeys.filter((k) => selected.includes(k));
    qs.set("columns", ordered.join(","));
    setOpen(false);
    window.location.href = `/api/renewals/export?${qs.toString()}`;
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={openDialog}
      trigger={
        <Button variant="outline">
          <DownloadIcon className="size-4" />
          Export
        </Button>
      }
      title="Export to Excel"
      description="Pick which columns to include. The download uses the filters and tab you have open now."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([...allKeys])}>
              Select all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={selected.length === 0} onClick={download}>
              <DownloadIcon className="size-4" />
              Download
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {columns.map((c) => (
          <label key={c.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(c.key)}
              onChange={(e) => toggle(c.key, e.target.checked)}
              className="size-4 shrink-0"
            />
            {c.label}
          </label>
        ))}
      </div>
    </ResponsiveDialog>
  );
}
