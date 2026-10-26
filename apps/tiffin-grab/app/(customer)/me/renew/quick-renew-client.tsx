"use client";

import { useRouter } from "next/navigation";
import { QuickRenewForm } from "@/components/renew/quick-renew-form";
import { useBounceAfterPaid } from "@/lib/payments/paid-flag";
import type { QuickRenewData } from "@/components/renew/types";
import { QUOTE_CODES_KEY, WIZARD_ORIGIN_KEY, WIZARD_PLAN_STEPS_KEY, WIZARD_STEP_KEY, WIZARD_STORAGE_KEY } from "@/components/wizard/selections";

export function QuickRenewClient(data: QuickRenewData) {
  const router = useRouter();
  // Back from a paid checkout must not reopen renewal (the new plan would now send it to the full wizard).
  const bouncing = useBounceAfterPaid();

  if (bouncing) return null;
  return (
    <QuickRenewForm
      {...data}
      variant="customer"
      submitLabel="Continue"
      changePlanHref="/me/renew?full=1"
      // Checkout's Delivery step comes next, with the default address already picked.
      onSubmit={async (s) => {
        sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(s));
        sessionStorage.setItem(WIZARD_ORIGIN_KEY, "renew");
        sessionStorage.setItem(WIZARD_PLAN_STEPS_KEY, JSON.stringify(["Plan"]));
        sessionStorage.removeItem(WIZARD_STEP_KEY);
        sessionStorage.removeItem(QUOTE_CODES_KEY);
        router.push("/checkout", { transitionTypes: ["nav-forward"] });
        return null;
      }}
    />
  );
}
