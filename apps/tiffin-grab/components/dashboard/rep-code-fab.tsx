"use client";

import { useState } from "react";
import { CalculatorIcon, TicketPercentIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { EstimateDialog } from "@/app/(dashboard)/dashboard/discounts/estimate-dialog";
import { QuickCodeDialog } from "./quick-code-dialog";

// Floating on every dashboard page for staff with a rep allowance: estimate the customer's order
// and issue a code sized against it, or (the round button) just create a code. Limits are
// enforced by the server action either way.
export function RepCodeFab() {
  const [estimating, setEstimating] = useState(false);
  const [coding, setCoding] = useState(false);
  return (
    <>
      <div className="fixed right-4 bottom-24 z-40 flex items-center gap-2 md:right-6 md:bottom-6">
        <Button
          type="button"
          variant="outline"
          aria-label="Create coupon"
          title="Create coupon"
          onClick={() => setCoding(true)}
          className="size-12 rounded-full p-0 shadow-lg"
        >
          <TicketPercentIcon className="size-5" />
        </Button>
        <Button type="button" onClick={() => setEstimating(true)} className="h-12 rounded-full px-5 shadow-lg">
          <CalculatorIcon className="size-4" /> Estimate
        </Button>
      </div>
      <EstimateDialog open={estimating} onOpenChange={setEstimating} />
      {coding && <QuickCodeDialog onOpenChange={setCoding} />}
    </>
  );
}
