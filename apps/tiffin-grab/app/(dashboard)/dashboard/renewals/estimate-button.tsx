"use client";

import { useState } from "react";
import { CalculatorIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { EstimateDialog } from "../discounts/estimate-dialog";

/** Opens the staff Estimate on the Plan step, filled from this order; the dialog mounts only once opened. */
export function EstimateButton({ orderPublicId }: { orderPublicId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalculatorIcon aria-hidden /> Estimate
      </Button>
      {open && <EstimateDialog open={open} onOpenChange={setOpen} fromOrder={orderPublicId} />}
    </>
  );
}
