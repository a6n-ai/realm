"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalculatorIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { NumberField } from "@/app/(dashboard)/dashboard/discounts/controls";
import type { ProfitabilityAssumptions } from "@/lib/analytics/profitability";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { saveAssumptionsAction } from "./actions";

const FIELDS: { key: keyof ProfitabilityAssumptions; label: string }[] = [
  { key: "kitchenCostPerTiffin", label: "Kitchen / tiffin" },
  { key: "driverCostPerTiffin", label: "Driver / tiffin" },
  { key: "otherCostPerTiffin", label: "Other / tiffin" },
  { key: "marketingMonthly", label: "Marketing / month" },
  { key: "salaryMonthly", label: "Salaries / month" },
  { key: "otherMonthly", label: "Other expenses / month" },
];

function asFields(
  current: ProfitabilityAssumptions,
): Record<keyof ProfitabilityAssumptions, string> {
  return {
    kitchenCostPerTiffin: String(current.kitchenCostPerTiffin || ""),
    driverCostPerTiffin: String(current.driverCostPerTiffin || ""),
    otherCostPerTiffin: String(current.otherCostPerTiffin || ""),
    marketingMonthly: String(current.marketingMonthly || ""),
    salaryMonthly: String(current.salaryMonthly || ""),
    otherMonthly: String(current.otherMonthly || ""),
  };
}

export function AssumptionsForm({
  current,
}: {
  current: ProfitabilityAssumptions;
}) {
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
    <div className="h-full [&>*]:h-full">
      <SectionCard
        title="Cost assumptions"
        subtitle="Per-tiffin costs apply to delivered tiffins. Monthly budgets are spread evenly across every day of that month, including days with no deliveries."
        action={<Badge variant="primary-light">Editable</Badge>}
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
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

            <div className="bg-muted/60 flex flex-col gap-1 rounded-lg p-3">
              <span className="text-foreground text-xs font-medium">
                How these feed profit
              </span>
              <p className="text-muted-foreground text-xs text-pretty">
                Saving recalculates net profit, margin, and average profit per
                tiffin for the selected period.
              </p>
            </div>
          </div>

          <Button onClick={save} disabled={pending} className="w-full gap-1.5">
            <CalculatorIcon className="size-4" aria-hidden />
            {pending ? "Saving…" : "Save assumptions"}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
