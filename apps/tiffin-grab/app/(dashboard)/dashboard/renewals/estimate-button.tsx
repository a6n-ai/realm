"use client";

import { useState } from "react";
import { CalculatorIcon } from "lucide-react";
import { RowActionTooltipButton } from "@/components/ds";
import { EstimateDialog } from "../discounts/estimate-dialog";

/** Opens the staff Estimate on the Plan step, filled from this order; the dialog mounts only once opened. */
export function EstimateButton({ orderPublicId }: { orderPublicId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RowActionTooltipButton icon={CalculatorIcon} label="Estimate" hint="Estimate a renewal: plan filled in, add codes, copy the link" onClick={() => setOpen(true)} />
      {open && <EstimateDialog open={open} onOpenChange={setOpen} fromOrder={orderPublicId} />}
    </>
  );
}
