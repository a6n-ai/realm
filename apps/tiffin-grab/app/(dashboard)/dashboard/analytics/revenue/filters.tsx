"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import type { FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";

export function RevenueFilters({
  from,
  to,
  methods,
}: {
  from: string;
  to: string;
  methods: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const explicit = params.has("from") || params.has("to");

  const spec = useMemo<FacetDef[]>(
    () => [
      {
        kind: "multi",
        field: "method",
        label: "Payment method",
        options: methods.map((m) => ({ value: m.value, label: m.label })),
      },
    ],
    [methods],
  );

  function write(nextFrom: string, nextTo: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("from", nextFrom);
    sp.set("to", nextTo);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  function clearRange() {
    const sp = new URLSearchParams(params.toString());
    sp.delete("from");
    sp.delete("to");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
        From
        <Input
          type="date"
          aria-label="From"
          className="h-8 w-[10.5rem]"
          value={from}
          max={to}
          onChange={(e) => {
            if (e.target.value) write(e.target.value, to);
          }}
        />
      </label>
      <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
        To
        <Input
          type="date"
          aria-label="To"
          className="h-8 w-[10.5rem]"
          value={to}
          min={from}
          onChange={(e) => {
            if (e.target.value) write(from, e.target.value);
          }}
        />
      </label>
      {explicit ? (
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={clearRange}>
          Month to date
        </Button>
      ) : null}
      <ReuiFacetFilters spec={spec} />
    </div>
  );
}
