import { requireAdmin } from "@/lib/auth/guards";
import { getMaxCoinPctOfSubtotal, getProvinceTaxes } from "@/lib/services/app-settings.service";
import { CoinCapForm } from "./coin-cap-form";
import { ProvinceTaxForm } from "./province-tax-form";

export default async function CheckoutRulesPage() {
  await requireAdmin();
  const [maxCoinPct, provinceTaxes] = await Promise.all([getMaxCoinPctOfSubtotal(), getProvinceTaxes()]);

  return (
    <div className="grid gap-6">
      <CoinCapForm current={maxCoinPct} />
      <ProvinceTaxForm overrides={provinceTaxes} />
    </div>
  );
}
