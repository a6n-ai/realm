"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FacetDef, Option } from "@/components/ds";
import { DateRangePicker } from "@realm/ui/date-range-picker";
import {
  Filters,
  type Filter,
  type FilterFieldConfig,
  type CustomRendererProps,
} from "@/components/reui/filters";

// The bridge speaks two value shapes: strings (select/pills/multi option
// values) and numbers (dateRange epoch-ms). One union keeps reui's generic
// happy without per-field casts.
type Val = string | number;

const SELECT_OP = "is";
const MULTI_OP = "is_any_of";
const DATE_OP = "between";

const csv = (raw: string | null): string[] =>
  raw ? raw.split(",").filter(Boolean) : [];

const num = (v: string | null): number | undefined =>
  v ? Number(v) : undefined;

function mapOptions(options: Option[]) {
  return options.map((o) => ({ value: String(o.value), label: o.label }));
}

// reui renders our DateRangePicker for dateRange facets. reui carries the value
// as values:[fromMs, toMs]; DateRangePicker speaks {from,to}. This maps between.
function DateFacetRenderer(label: string) {
  return function render({ values, onChange }: CustomRendererProps<Val>) {
    const from = typeof values[0] === "number" ? (values[0] as number) : undefined;
    const to = typeof values[1] === "number" ? (values[1] as number) : undefined;
    return (
      <DateRangePicker
        label={label}
        from={from}
        to={to}
        onChange={(r) =>
          onChange(
            [r.from, r.to].filter((v): v is number => v != null) as Val[],
          )
        }
      />
    );
  };
}

export function ReuiFacetFilters({ spec }: { spec: FacetDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Fields describe the menu + chips. dependsOn options are pruned against the
  // parent facet's current URL selection so children stay in sync.
  const fields = useMemo<FilterFieldConfig<Val>[]>(() => {
    return spec.flatMap((f): FilterFieldConfig<Val>[] => {
      if (f.kind === "search") return [];
      if (f.kind === "dateRange") {
        return [
          {
            key: f.field,
            label: f.label,
            type: "custom",
            operators: [{ value: DATE_OP, label: "between" }],
            defaultOperator: DATE_OP,
            customRenderer: DateFacetRenderer(f.label),
          },
        ];
      }
      if (f.kind === "pills" || f.kind === "select") {
        return [
          {
            key: f.field,
            label: f.label,
            type: "select",
            operators: [{ value: SELECT_OP, label: "is" }],
            defaultOperator: SELECT_OP,
            options: mapOptions(f.options),
            searchable: f.kind === "select",
          },
        ];
      }
      // multi (+ optional dependsOn)
      const parentVals = f.dependsOn ? csv(params.get(f.dependsOn)) : [];
      const options =
        f.dependsOn && parentVals.length
          ? f.options.filter(
              (o) => o.parent == null || parentVals.includes(o.parent),
            )
          : f.options;
      return [
        {
          key: f.field,
          label: f.label,
          type: "multiselect",
          operators: [{ value: MULTI_OP, label: "is any of" }],
          defaultOperator: MULTI_OP,
          options: mapOptions(options),
        },
      ];
    });
  }, [spec, params]);

  // URL is the source of truth: derive the controlled Filter[] from params each
  // render, one Filter per active facet.
  const filters = useMemo<Filter<Val>[]>(() => {
    const out: Filter<Val>[] = [];
    for (const f of spec) {
      if (f.kind === "search") continue;
      if (f.kind === "dateRange") {
        const from = num(params.get("from"));
        const to = num(params.get("to"));
        if (from != null || to != null) {
          out.push({
            id: f.field,
            field: f.field,
            operator: DATE_OP,
            values: [from, to].filter((v): v is number => v != null),
          });
        }
        continue;
      }
      if (f.kind === "multi") {
        const values = csv(params.get(f.field));
        if (values.length) {
          out.push({ id: f.field, field: f.field, operator: MULTI_OP, values });
        }
        continue;
      }
      // pills | select
      const v = params.get(f.field);
      if (v) {
        out.push({ id: f.field, field: f.field, operator: SELECT_OP, values: [v] });
      }
    }
    return out;
  }, [spec, params]);

  // Serialize the next Filter[] back into the exact URL params parseFilterState
  // reads. Any facet absent from `next` has its param(s) deleted.
  const onChange = (next: Filter<Val>[]) => {
    const sp = new URLSearchParams(params.toString());
    const byField = new Map(next.map((n) => [n.field, n]));

    for (const f of spec) {
      if (f.kind === "search") continue;
      if (f.kind === "dateRange") {
        const hit = byField.get(f.field);
        const from = hit && typeof hit.values[0] === "number" ? hit.values[0] : undefined;
        const to = hit && typeof hit.values[1] === "number" ? hit.values[1] : undefined;
        if (from != null) sp.set("from", String(from));
        else sp.delete("from");
        if (to != null) sp.set("to", String(to));
        else sp.delete("to");
        continue;
      }
      const hit = byField.get(f.field);
      const values = (hit?.values ?? []).map(String).filter(Boolean);
      if (f.kind === "multi") {
        if (values.length) sp.set(f.field, values.join(","));
        else sp.delete(f.field);
      } else {
        // pills | select — single value
        if (values.length) sp.set(f.field, values[0]);
        else sp.delete(f.field);
      }
    }

    sp.delete("page"); // any filter change resets to page 0
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <Filters<Val>
      filters={filters}
      fields={fields}
      onChange={onChange}
      size="sm"
      showSearchInput={false}
    />
  );
}
