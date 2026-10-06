import { desc, eq } from "drizzle-orm";
import { CoinRateForm, WalletCapForm } from "@foundry/crm";
import { db } from "@/db/client";
import { coinRate } from "@/db/schema";
import { requirePermission } from "@/lib/auth/guards";
import { getAppClock, getMaxWalletBalance } from "@/lib/services/app-settings.service";
import { saveCoinRateAction, saveWalletCapAction } from "../actions";

export default async function WalletCoinRatePage() {
  await requirePermission({ wallet: ["read"] });
  const { currency } = await getAppClock();
  const [[latest], maxWalletBalance] = await Promise.all([
    db
      .select({ valuePerCoin: coinRate.valuePerCoin })
      .from(coinRate)
      .where(eq(coinRate.currency, currency))
      .orderBy(desc(coinRate.createdAt))
      .limit(1),
    getMaxWalletBalance(),
  ]);
  return (
    <div className="grid gap-6">
      <CoinRateForm currency={currency} current={latest ?? null} onSave={saveCoinRateAction} />
      <WalletCapForm current={maxWalletBalance} onSave={saveWalletCapAction} />
    </div>
  );
}
