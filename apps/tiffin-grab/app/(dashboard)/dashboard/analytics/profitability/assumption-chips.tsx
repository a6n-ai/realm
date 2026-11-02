"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Badge } from "@/components/reui/badge";
import type { ProfitabilityAssumptions } from "@/lib/analytics/profitability";
import { AssumptionsForm } from "./assumptions-form";

const WHOLE = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const money = (n: number) => (Number.isInteger(n) ? WHOLE : CENTS).format(n);

/** The cost assumptions as a row of chips, like active filters, with an Edit popover. */
export function AssumptionChips({ current }: { current: ProfitabilityAssumptions }) {
  const [open, setOpen] = useState(false);
  const chips = [
    `Kitchen ${money(current.kitchenCostPerTiffin)}/tiffin`,
    `Driver ${money(current.driverCostPerTiffin)}/tiffin`,
    `Other ${money(current.otherCostPerTiffin)}/tiffin`,
    `Marketing ${money(current.marketingMonthly)}/mo`,
    `Salaries ${money(current.salaryMonthly)}/mo`,
    `Other ${money(current.otherMonthly)}/mo`,
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Cost assumptions">
      <span className="text-muted-foreground text-xs">Cost assumptions</span>
      {chips.map((c) => (
        <Badge key={c} variant="outline">
          {c}
        </Badge>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <PencilIcon aria-hidden />
            Edit
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)]">
          <AssumptionsForm current={current} onSaved={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
