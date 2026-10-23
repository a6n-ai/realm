"use client";

import { useRouter } from "next/navigation";
import { QuickRenewForm } from "@/components/renew/quick-renew-form";
import type { QuickRenewData } from "@/components/renew/types";
import {
  RENEW_ADDRESS_KEY,
  RENEW_PAY_KEY,
  WIZARD_ORIGIN_KEY,
  WIZARD_STEP_KEY,
  WIZARD_STORAGE_KEY,
  type WizardSelections,
} from "@/components/wizard/selections";

export function QuickRenewClient(data: QuickRenewData) {
  const router = useRouter();

  const stash = (s: WizardSelections) => {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(s));
    sessionStorage.setItem(WIZARD_ORIGIN_KEY, "renew");
    sessionStorage.removeItem(WIZARD_STEP_KEY);
    sessionStorage.removeItem(RENEW_PAY_KEY);
    sessionStorage.removeItem(RENEW_ADDRESS_KEY);
  };

  return (
    <QuickRenewForm
      {...data}
      variant="customer"
      submitLabel="Continue to pay"
      changePlanHref="/me/renew?full=1"
      onSubmit={async (s, addressPublicId) => {
        stash(s);
        sessionStorage.setItem(RENEW_PAY_KEY, "1");
        if (addressPublicId) sessionStorage.setItem(RENEW_ADDRESS_KEY, addressPublicId);
        router.push("/checkout", { transitionTypes: ["nav-forward"] });
        return null;
      }}
      onUseNewAddress={(s) => {
        stash(s);
        router.push("/checkout", { transitionTypes: ["nav-forward"] });
      }}
    />
  );
}
