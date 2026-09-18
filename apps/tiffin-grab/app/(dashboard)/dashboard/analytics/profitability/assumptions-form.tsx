"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { NumberField } from "@/app/(dashboard)/dashboard/discounts/controls";
import type { ProfitabilityAssumptions } from "@/lib/analytics/profitability";
import { saveAssumptionsAction } from "./actions";

const FIELDS: { key: keyof ProfitabilityAssumptions; label: string }[] = [
  { key: "kitchenCostPerTiffin", label: "Kitchen / tiffin" },
  { key: "driverCostPerTiffin", label: "Driver / tiffin" },
  { key: "otherCostPerTiffin", label: "Other / tiffin" },
  { key: "marketingMonthly", label: "Marketing / month" },
  { key: "salaryMonthly", label: "Salaries / month" },
  { key: "otherMonthly", label: "Other expenses / month" },
];

function asFields(current: ProfitabilityAssumptions): Record<keyof ProfitabilityAssumptions, string> {
  return {
    kitchenCostPerTiffin: String(current.kitchenCostPerTiffin || ""),
    driverCostPerTiffin: String(current.driverCostPerTiffin || ""),
    otherCostPerTiffin: String(current.otherCostPerTiffin || ""),
    marketingMonthly: String(current.marketingMonthly || ""),
    salaryMonthly: String(current.salaryMonthly || ""),
    otherMonthly: String(current.otherMonthly || ""),
  };
}

export function AssumptionsForm({ current }: { current: ProfitabilityAssumptions }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fields, setFields] = React.useState(() => asFields(current));

  function save() {
    const parsed: ProfitabilityAssumptions = {
      kitchenCostPerTiffin: Number(fields.kitchenCostPerTiffin || 0),
      driverCostPerTiffin: Number(fields.driverCostPerTiffin || 0),
      otherCostPerTiffin: Number(fields.otherCostPerTiffin || 0),
      marketingMonthly: Number(fields.marketingMonthly || 0),
      salaryMonthly: Number(fields.salaryMonthly || 0),
      otherMonthly: Number(fields.otherMonthly || 0),
    };
    if (Object.values(parsed).some((n) => !Number.isFinite(n) || n < 0)) {
      toast.error("Costs must be zero or a positive amount");
      return;
    }
    start(async () => {
      try {
        await saveAssumptionsAction(parsed);
        toast.success("Cost assumptions saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <SectionCard
      title="Cost assumptions"
      subtitle="Per-tiffin costs apply to delivered tiffins. Monthly budgets are spread evenly across every day of that month, including days with no deliveries."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <NumberField
            key={f.key}
            id={f.key}
            label={f.label}
            prefix="$"
            min={0}
            step={0.01}
            value={fields[f.key]}
            onChange={(v) => setFields((s) => ({ ...s, [f.key]: v }))}
            placeholder="0"
          />
        ))}
      </div>
      <Button onClick={save} disabled={pending} className="mt-4 w-fit">
        Save assumptions
      </Button>
    </SectionCard>
  );
}
