"use client";

import type { WizardSelections } from "@/components/wizard/selections";
import { QuickRenewFormAdmin } from "./quick-renew-form-admin";
import type { QuickRenewData } from "./types";

export type QuickRenewFormProps = QuickRenewData & {
  /** Customers renew inside Checkout (`RenewCheckout`); this form is the staff one. */
  variant: "admin";
  submitLabel: string;
  /** Returns an error message, or null when the order was placed. */
  onSubmit: (s: WizardSelections, addressPublicId: string | null) => Promise<string | null>;
};

/** One-screen renewal for staff: everything prefilled, one button to renew. */
export function QuickRenewForm({ variant: _variant, ...data }: QuickRenewFormProps) {
  return <QuickRenewFormAdmin {...data} />;
}
