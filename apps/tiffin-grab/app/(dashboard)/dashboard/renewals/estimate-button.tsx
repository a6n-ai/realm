"use client";

import { useState } from "react";
import { CalculatorIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { RowActionTooltipButton } from "@/components/ds";
import { EstimateDialog } from "../_order/estimate-dialog";

/** Opens the staff Estimate on the Plan step, filled from this order; the dialog mounts only once opened. `primary` renders the labelled card action. */
export function EstimateButton({ orderPublicId, primary = false }: { orderPublicId: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {primary ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <CalculatorIcon className="size-4" />
          Send renewal estimate
        </Button>
      ) : (
        <RowActionTooltipButton icon={CalculatorIcon} label="Estimate" hint="Estimate a renewal: plan filled in, add codes, copy the link" onClick={() => setOpen(true)} />
      )}
      {open && <EstimateDialog open={open} onOpenChange={setOpen} fromOrder={orderPublicId} />}
    </>
  );
}
