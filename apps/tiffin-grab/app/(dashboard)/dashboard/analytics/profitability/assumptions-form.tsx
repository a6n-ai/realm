"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalculatorIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { NumberField } from "@/components/dashboard/form-controls";
import type { ProfitabilityAssumptions } from "@/lib/analytics/profitability";
import { unwrapAction } from "@/lib/actions/unwrap";
import { saveAssumptionsAction } from "./actions";

type Key = keyof ProfitabilityAssumptions;
const PCT = new Set<Key>(["targetMarginPct", "minMarginPct"]);
const FIELDS: { key: Key; label: string }[] = [
  { key: "driverCostPerTiffin", label: "Driver / tiffin" },
  { key: "otherCostPerTiffin", label: "Other / tiffin" },
  { key: "marketingMonthly", label: "Marketing / month" },
  { key: "salaryMonthly", label: "Salaries / month" },
  { key: "otherMonthly", label: "Other expenses / month" },
  { key: "targetMarginPct", label: "Target margin" },
  { key: "minMarginPct", label: "Minimum margin" },
];

function asFields(current: ProfitabilityAssumptions): Record<Key, string> {
  return Object.fromEntries(FIELDS.map((f) => [f.key, PCT.has(f.key) ? String(current[f.key]) : String(current[f.key] || "")])) as Record<Key, string>;
}

export function AssumptionsForm({
  current,
  onSaved,
}: {
  current: ProfitabilityAssumptions;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fields, setFields] = React.useState(() => asFields(current));

  function save() {
    const parsed = Object.fromEntries(FIELDS.map((f) => [f.key, Number(fields[f.key] || 0)])) as ProfitabilityAssumptions;
    if (Object.values(parsed).some((n) => !Number.isFinite(n) || n < 0)) {
      toast.error("Costs must be zero or a positive amount");
      return;
    }
    if (parsed.targetMarginPct > 95 || parsed.minMarginPct > parsed.targetMarginPct) {
      toast.error("Margins go up to 95%, and the minimum cannot be above the target");
      return;
    }
    start(async () => {
      try {
        await unwrapAction(saveAssumptionsAction(parsed));
        toast.success("Cost assumptions saved");
        router.refresh();
        onSaved?.();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">
        Per-tiffin costs apply to delivered tiffins. Monthly budgets are spread evenly across every day of that month. Margins guide
        staff discounts: Estimate and New order recommend staying at the target, and refuse discounts below the minimum.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <NumberField
            key={f.key}
            id={f.key}
            label={f.label}
            prefix={PCT.has(f.key) ? undefined : "$"}
            suffix={PCT.has(f.key) ? "%" : undefined}
            min={0}
            max={PCT.has(f.key) ? 95 : undefined}
            step={0.01}
            value={fields[f.key]}
            onChange={(v) => setFields((s) => ({ ...s, [f.key]: v }))}
            placeholder="0"
          />
        ))}
      </div>
      <Button onClick={save} disabled={pending} className="w-full">
        <CalculatorIcon aria-hidden />
        {pending ? "Saving…" : "Save assumptions"}
      </Button>
    </div>
  );
}
