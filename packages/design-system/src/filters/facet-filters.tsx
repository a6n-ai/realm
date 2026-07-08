"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Check, ChevronDown, X } from "lucide-react";
import type { FacetDef, Option } from "./facet";
import { Button } from "@realm/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@realm/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@realm/ui/command";
import { DateRangePicker } from "@realm/ui/date-range-picker";
import { cn } from "@realm/ui/cn";

function useParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page"); // any filter change resets to page 0
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  return { params, set };
}

const num = (v: string | null) => (v ? Number(v) : undefined);

export function FacetFilters({ spec }: { spec: FacetDef[] }) {
  const { params, set } = useParams();

  const activeKeys = spec.flatMap((f) =>
    f.kind === "search" ? [] : f.kind === "dateRange" ? ["from", "to"] : [f.field],
  );
  const anyActive = activeKeys.some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {spec.map((f) => {
        if (f.kind === "search") return null; // search rendered by the page's SearchInput
        if (f.kind === "dateRange") {
          return (
            <DateRangePicker
              key={f.field}
              label={f.label}
              from={num(params.get("from"))}
              to={num(params.get("to"))}
              onChange={(r) =>
                set({ from: r.from != null ? String(r.from) : null, to: r.to != null ? String(r.to) : null })
              }
            />
          );
        }
        if (f.kind === "pills") {
          const current = params.get(f.field);
          return (
            <SingleSelectFacet
              key={f.field}
              label={f.label}
              options={f.options}
              value={current}
              onChange={(v) => set({ [f.field]: v })}
            />
          );
        }
        if (f.kind === "select") {
          const current = params.get(f.field);
          return (
            <SingleSelectFacet
              key={f.field}
              label={f.label}
              options={f.options}
              value={current}
              onChange={(v) => set({ [f.field]: v })}
              searchable
            />
          );
        }
        // multi (+ optional dependsOn)
        const raw = params.get(f.field) ?? "";
        const values = raw ? raw.split(",").filter(Boolean) : [];
        const parentVals =
          f.dependsOn ? (params.get(f.dependsOn) ?? "").split(",").filter(Boolean) : [];
        const opts =
          f.dependsOn && parentVals.length
            ? f.options.filter((o) => o.parent == null || parentVals.includes(o.parent))
            : f.options;
        return (
          <MultiSelectFacet
            key={f.field}
            label={f.label}
            options={opts}
            values={values}
            onChange={(vs) => set({ [f.field]: vs.length ? vs.join(",") : null })}
          />
        );
      })}
      {anyActive && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => set(Object.fromEntries(activeKeys.map((k) => [k, null])))}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

function triggerCn(active: boolean) {
  return cn(
    "h-8 gap-1.5 rounded-full border px-3 font-normal transition-transform active:scale-[0.97]",
    active
      ? "border-primary/40 bg-primary/10 text-foreground"
      : "border-border text-muted-foreground",
  );
}

function SingleSelectFacet({
  label, options, value, onChange, searchable,
}: {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (v: string | null) => void;
  searchable?: boolean;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={triggerCn(Boolean(selected))}>
          {label}
          {selected && <span className="font-medium">: {selected.label}</span>}
          {selected ? (
            <X
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label} filter`}
              className="size-3.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }
              }}
            />
          ) : (
            <ChevronDown className="size-3.5 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  onSelect={() => onChange(o.value === value ? null : o.value)}
                >
                  <Check className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">{o.label}</span>
                  {o.count != null && (
                    <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectFacet({
  label, options, values, onChange,
}: {
  label: string;
  options: Option[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={triggerCn(values.length > 0)}>
          {label}
          {values.length > 0 && <span className="font-medium">: {values.length}</span>}
          {values.length > 0 ? (
            <X
              role="button"
              tabIndex={0}
              aria-label={`Clear ${label} filter`}
              className="size-3.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }
              }}
            />
          ) : (
            <ChevronDown className="size-3.5 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} onSelect={() => toggle(o.value)}>
                  <Check
                    className={cn("size-4", values.includes(o.value) ? "opacity-100" : "opacity-0")}
                  />
                  <span className="flex-1">{o.label}</span>
                  {o.count != null && (
                    <span className="text-xs tabular-nums text-muted-foreground">{o.count}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
