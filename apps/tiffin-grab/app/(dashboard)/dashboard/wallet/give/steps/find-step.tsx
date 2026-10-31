"use client";

import * as React from "react";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { DateInput } from "@/components/dashboard/date-fields";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { Filters, type CustomRendererProps, type Filter, type FilterFieldConfig } from "@/components/reui/filters";
import { getPayoutCandidates } from "../../actions";
import type { Candidate } from "../types";

type Fields = FilterFieldConfig<string>[];

function DatePair({ values, onChange }: CustomRendererProps<string>) {
  return (
    <span className="flex items-center gap-2">
      <DateInput clearable value={values[0] ?? ""} onChange={(v) => onChange([v, values[1] ?? ""])} placeholder="From" className="w-36" />
      <DateInput clearable value={values[1] ?? ""} onChange={(v) => onChange([values[0] ?? "", v])} placeholder="To" className="w-36" />
    </span>
  );
}

const dateRange = (key: string, label: string): FilterFieldConfig<string> => ({
  key,
  label,
  type: "custom",
  operators: [{ value: "between", label: "between" }],
  defaultOperator: "between",
  customRenderer: DatePair,
});

function buildFields(cities: string[]): Fields {
  return [
    {
      key: "revenue",
      label: "Revenue",
      type: "custom",
      operators: [
        { value: ">", label: "more than" },
        { value: "<", label: "less than" },
        { value: "=", label: "equal to" },
      ],
      defaultOperator: ">",
      customRenderer: ({ values, onChange }) => (
        <Input
          type="number"
          min={0}
          step={0.01}
          placeholder="$ amount"
          value={values[0] ?? ""}
          onChange={(e) => onChange([e.target.value])}
          className="h-6 w-28"
        />
      ),
    },
    { key: "city", label: "City", type: "select", operators: [{ value: "is", label: "is" }], defaultOperator: "is", options: cities.map((c) => ({ value: c, label: c })), searchable: true },
    dateRange("startDate", "Ordering since"),
    dateRange("lastTiffin", "Last tiffin"),
    dateRange("lapsed", "Lapsed"),
  ];
}

type Parsed = { input: Record<string, unknown> } | { error: string };

function parseFilters(filters: Filter<string>[]): Parsed {
  const input: Record<string, unknown> = {};
  const get = (field: string) => filters.find((f) => f.field === field);
  const range = (field: string, from: string, to: string) => {
    const f = get(field);
    if (!f) return;
    if (f.values[0]) input[from] = f.values[0];
    if (f.values[1]) input[to] = f.values[1];
  };
  const rev = get("revenue");
  if (rev) {
    const n = Number(rev.values[0]);
    if (!rev.values[0] || !Number.isFinite(n)) return { error: "Enter a revenue amount" };
    input.revenueOp = rev.operator;
    input.revenueValue = n;
  }
  const city = get("city")?.values[0];
  if (city) input.city = city;
  range("startDate", "startDateFrom", "startDateTo");
  range("lastTiffin", "lastTiffinFrom", "lastTiffinTo");
  if (get("lapsed")) {
    input.lapsed = true;
    range("lapsed", "lapsedFrom", "lapsedTo");
  }
  return { input };
}

export function FindStep({
  cities,
  maxRows,
  filters,
  onFiltersChange,
  onFound,
}: {
  cities: string[];
  maxRows: number;
  filters: Filter<string>[];
  onFiltersChange: (f: Filter<string>[]) => void;
  onFound: (rows: Candidate[], payload: Record<string, unknown>) => void;
}) {
  const fields = React.useMemo(() => buildFields(cities), [cities]);
  const [pending, startSearch] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const run = () => {
    const parsed = parseFilters(filters);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setError(null);
    startSearch(async () => {
      try {
        const { rows, total } = await getPayoutCandidates(parsed.input);
        if (total > maxRows) {
          setError(`${total} customers match - narrow the filters to ${maxRows} or fewer.`);
          return;
        }
        onFound(rows, parsed.input);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Search failed";
        setError(msg);
        toast.error(msg);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Add filters to narrow down who gets coins. With no filters, every customer is included.
      </p>
      <Filters<string> filters={filters} fields={fields} onChange={onFiltersChange} size="sm" showSearchInput={false} />
      {error && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription className="flex items-center justify-between gap-2">
            {error}
            <Button size="sm" variant="outline" onClick={run} disabled={pending}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button onClick={run} disabled={pending}>
          {pending ? "Finding..." : "Find customers"}
        </Button>
      </div>
    </div>
  );
}
