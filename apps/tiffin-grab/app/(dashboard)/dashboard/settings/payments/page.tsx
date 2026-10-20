import Link from "next/link";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { PAYMENT_PROVIDERS } from "@foundry/payments/providers";
import { requireAdmin } from "@/lib/auth/guards";
import { SectionCard, TonePill } from "@/components/ds";
import {
  ensurePaymentCatalog,
  getMaxCoinPctOfSubtotal,
  getMaxCoinRedeemPctOfBalance,
  getProvinceTaxes,
  installedPlugins,
} from "@/lib/services/app-settings.service";

// Every provider is added here; Stripe lists once its plugin is installed (Add installs it).
const MANUAL_IDS = new Set(["cash", "etransfer"]);

function providerHref(id: string): string {
  return id === "stripe" ? "/dashboard/settings/payments/stripe" : `/dashboard/settings/payments/${id}`;
}

export default async function PaymentsSettingsHub() {
  await requireAdmin();
  const [cfg, maxCoinPct, maxRedeemPct, provinceTaxes, plugins] = await Promise.all([
    ensurePaymentCatalog(),
    getMaxCoinPctOfSubtotal(),
    getMaxCoinRedeemPctOfBalance(),
    getProvinceTaxes(),
    installedPlugins(),
  ]);

  const providers = PAYMENT_PROVIDERS.filter(
    (p) => MANUAL_IDS.has(p.id) || (p.requiresPlugin != null && plugins.includes(p.requiresPlugin)),
  );
  const installed = providers
    .map((p) => ({ provider: p, method: cfg.methods.find((m) => m.id === p.id) }))
    .filter((r) => r.method);
  const canAdd = installed.length < PAYMENT_PROVIDERS.length;
  const customizedProvinces = Object.keys(provinceTaxes).length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard
        title="Payment providers"
        subtitle="How customers pay at checkout. Each provider has its own label, instructions and on/off switch."
        action={
          canAdd ? (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/dashboard/settings/payments/add" prefetch={false}>
                <PlusIcon className="size-3.5" />
                Add provider
              </Link>
            </Button>
          ) : null
        }
      >
        {installed.length === 0 ? (
          <p className="text-muted-foreground text-sm">No providers yet. Add one to take payments.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {installed.map(({ provider, method }) => (
              <li key={provider.id}>
                <Link
                  href={providerHref(provider.id)}
                  prefetch={false}
                  className="hover:bg-muted/50 flex items-center gap-3 px-3 py-2.5"
                >
                  <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-md">
                    <provider.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{method!.label}</span>
                  <TonePill tone={method!.enabled ? "ok" : "neutral"}>{method!.enabled ? "On" : "Off"}</TonePill>
                  <ChevronRightIcon className="text-muted-foreground size-4" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Taxes & coins"
        subtitle="Order-wide rules. Tax follows the delivery province; a provider's own taxes apply only when the province is unknown."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings/payments/checkout-rules" prefetch={false}>
              Edit
            </Link>
          </Button>
        }
      >
        <dl className="grid gap-2 text-sm">
          <SummaryRow
            label="Sales tax"
            value={
              customizedProvinces === 0
                ? "By delivery province, standard rates"
                : `By delivery province, ${customizedProvinces} customized`
            }
          />
          <SummaryRow
            label="Coins per order"
            value={maxCoinPct == null ? "No limit" : `Up to ${maxCoinPct}% of subtotal`}
          />
          <SummaryRow
            label="Wallet per order"
            value={maxRedeemPct == null ? "No limit" : `Up to ${maxRedeemPct}% of balance`}
          />
        </dl>
      </SectionCard>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
