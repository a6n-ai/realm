import Link from "next/link";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { PAYMENT_PROVIDERS } from "@foundry/payments/providers";
import { requireAdmin } from "@/lib/auth/guards";
import { SectionCard, TonePill } from "@/components/ds";
import { ensurePaymentCatalog, getProvinceTaxes } from "@/lib/services/app-settings.service";

// Stripe joins this list once its provider ships; the hub needs no other change.
const PROVIDER_IDS = new Set(["cash", "etransfer"]);

export default async function PaymentsSettingsHub() {
  await requireAdmin();
  const [cfg, provinceTaxes] = await Promise.all([ensurePaymentCatalog(), getProvinceTaxes()]);

  const providers = PAYMENT_PROVIDERS.filter((p) => PROVIDER_IDS.has(p.id));
  const installed = providers
    .map((p) => ({ provider: p, method: cfg.methods.find((m) => m.id === p.id) }))
    .filter((r) => r.method);
  const canAdd = installed.length < providers.length;
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
                  href={`/dashboard/settings/payments/${provider.id}`}
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
        title="Taxes"
        subtitle="Tax follows the delivery province; a provider's own taxes apply only when the province is unknown. Coin limits live in Wallet → Settings."
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
