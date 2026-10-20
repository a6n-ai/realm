"use client";

import { useState } from "react";
import { CalculatorIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { EstimateDialog } from "@/app/(dashboard)/dashboard/discounts/estimate-dialog";

// Floating on every dashboard page for staff with a rep allowance: estimate the customer's order,
// then issue a one-off code sized against it. Codes are issued from the estimate only, so each
// one matches a priced order; limits are enforced by the server action.
export function RepCodeFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-24 z-40 h-12 rounded-full px-5 shadow-lg md:right-6 md:bottom-6"
      >
        <CalculatorIcon className="size-4" /> Estimate
      </Button>
      <EstimateDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
