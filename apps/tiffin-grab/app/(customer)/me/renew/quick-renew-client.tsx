"use client";

import { useState } from "react";
import { Button, Sheet } from "@/components/customer/kit";
import { AddonsPanel } from "@/components/wizard/addons-panel";
import { Checkout } from "@/components/checkout/checkout";
import { RenewPlanStep } from "@/components/renew/renew-plan-step";
import { useQuickRenew } from "@/components/renew/use-quick-renew";
import type { QuickRenewData } from "@/components/renew/types";
import type { CheckoutProps } from "@/lib/checkout/load-checkout-props";

/**
 * Quick renew on one page: Plan is Checkout's step 0, so Plan → Delivery → Payment slide in place with
 * no navigation. This component never unmounts, so plan picks survive going Back to Plan. A refresh
 * re-renders from the server's picks (unsaved plan edits are lost); nothing is written to sessionStorage.
 * Checkout's own useBounceAfterPaid is the only one: a second would fight it over the SEEN stamp.
 */
export function RenewCheckout({ data, checkout }: { data: QuickRenewData; checkout: CheckoutProps }) {
  const q = useQuickRenew({ ...data, submitLabel: "", onSubmit: async () => null });
  const [addonsOpen, setAddonsOpen] = useState(false);

  return (
    <>
      <Checkout
        {...checkout}
        closeHref="/me"
        plan={{
          body: <RenewPlanStep q={q} data={data} changePlanHref="/me/renew?full=1" onOpenAddons={() => setAddonsOpen(true)} />,
          selections: q.sel,
          price: q.price.result,
          canContinue: q.canSubmit,
          pending: q.price.loading,
        }}
      />
      <Sheet
        bottom
        open={addonsOpen}
        onClose={() => setAddonsOpen(false)}
        title="Add to every tiffin?"
        footer={<Button variant="primary" size="lg" className="w-full" onClick={() => setAddonsOpen(false)}>{q.addonCount > 0 ? "Done" : "Skip extras"}</Button>}
      >
        <p className="text-muted-foreground -mt-1 mb-3 text-[13px]">Optional extras for your {q.meal?.name ?? "meal"}, billed per tiffin.</p>
        <AddonsPanel bare addons={q.addons} categoryLabels={q.catalog.categoryLabels} categoryIcons={q.catalog.categoryIcons} selections={q.sel} set={q.set} className="pb-2" />
      </Sheet>
    </>
  );
}
