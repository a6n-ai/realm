import { requireAdmin } from "@/lib/auth/guards";
import { getProvinceTaxes } from "@/lib/services/app-settings.service";
import { ProvinceTaxForm } from "./province-tax-form";
import { PaymentsBackLink } from "../back-link";

// Coin limits moved to Wallet → Settings (2026-10); this page is tax only.
export default async function CheckoutRulesPage() {
  await requireAdmin();
  const provinceTaxes = await getProvinceTaxes();

  return (
    <div className="grid gap-6">
      <PaymentsBackLink />
      <ProvinceTaxForm overrides={provinceTaxes} />
    </div>
  );
}
