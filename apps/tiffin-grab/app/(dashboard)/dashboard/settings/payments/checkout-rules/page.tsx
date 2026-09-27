import { requireAdmin } from "@/lib/auth/guards";
import { getMaxCoinPctOfSubtotal, getMaxCoinRedeemPctOfBalance, getProvinceTaxes } from "@/lib/services/app-settings.service";
import { CoinCapForm } from "./coin-cap-form";
import { WalletRedeemCapForm } from "./wallet-redeem-cap-form";
import { ProvinceTaxForm } from "./province-tax-form";

export default async function CheckoutRulesPage() {
  await requireAdmin();
  const [maxCoinPct, maxRedeemPct, provinceTaxes] = await Promise.all([getMaxCoinPctOfSubtotal(), getMaxCoinRedeemPctOfBalance(), getProvinceTaxes()]);

  return (
    <div className="grid gap-6">
      <WalletRedeemCapForm current={maxRedeemPct} />
      <CoinCapForm current={maxCoinPct} />
      <ProvinceTaxForm overrides={provinceTaxes} />
    </div>
  );
}
