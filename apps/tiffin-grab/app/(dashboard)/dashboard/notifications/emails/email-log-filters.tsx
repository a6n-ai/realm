"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@realm/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";

const STATUSES = ["all", "sent", "failed", "suppressed"] as const;

/** Status + recipient filters for the unified email list; writes ?status/?q and resets page. */
export function EmailLogFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "all";
  const q = params.get("q") ?? "";

  function set(next: { status?: string; q?: string }) {
    const p = new URLSearchParams(params.toString());
    if (next.status !== undefined) {
      next.status === "all" ? p.delete("status") : p.set("status", next.status);
    }
    if (next.q !== undefined) {
      next.q ? p.set("q", next.q) : p.delete("q");
    }
    p.delete("page"); // any filter change returns to the first page
    router.push(`?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search recipient…"
        defaultValue={q}
        className="h-9 w-56"
        onKeyDown={(e) => {
          if (e.key === "Enter") set({ q: (e.target as HTMLInputElement).value.trim() });
        }}
      />
      <Select value={status} onValueChange={(v) => set({ status: v })}>
        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
