import { Suspense } from "react";
import { PlusIcon, ReceiptIcon } from "lucide-react";
import { PAYMENT_PROVIDERS } from "@foundry/payments/providers";
import { Badge } from "@/components/reui/badge";
import { ensurePaymentCatalog, getProvinceTaxes, installedPlugins } from "@/lib/services/app-settings.service";
import { IconTile } from "../_components/icon-tile";
import { SettingsColumns, SettingsGroup, SettingsGroupSkeleton, SettingsRow } from "../_components/grouped-list";
import { providerDisplay, providerHref } from "./provider-display";

// Every provider is added here; Stripe lists once its plugin is installed (Add installs it).
const MANUAL_IDS = new Set(["cash", "etransfer"]);

export default async function PaymentsSettingsHub() {
  return (
    <Suspense fallback={<PaymentsHubSkeleton />}>
      <PaymentsHub />
    </Suspense>
  );
}

async function PaymentsHub() {
  const [cfg, provinceTaxes, plugins] = await Promise.all([ensurePaymentCatalog(), getProvinceTaxes(), installedPlugins()]);

  const providers = PAYMENT_PROVIDERS.filter(
    (p) => MANUAL_IDS.has(p.id) || (p.requiresPlugin != null && plugins.includes(p.requiresPlugin)),
  );
  const added = providers.flatMap((p) => {
    const method = cfg.methods.find((m) => m.id === p.id);
    return method ? [{ provider: p, method }] : [];
  });
  const canAdd = added.length < PAYMENT_PROVIDERS.length;
  const customizedProvinces = Object.keys(provinceTaxes).length;

  return (
    <SettingsColumns>
      <SettingsGroup title="Payment methods">
        {added.map(({ provider, method }) => {
          const d = providerDisplay(provider.id);
          const isDefault = cfg.defaultMethodId === provider.id;
          return (
            <SettingsRow
              key={provider.id}
              href={providerHref(provider.id)}
              tile={<IconTile icon={provider.icon} tone={d.tone} logo={d.logo} />}
              // Staff see the provider ("Stripe"); the checkout label is set on its own page.
              label={provider.id === "stripe" ? "Stripe" : method.label}
              description={`${d.kind} · ${d.settles}${isDefault ? " · Default at checkout" : ""}`}
              trailing={
                <Badge variant={method.enabled ? "success-light" : "secondary"}>{method.enabled ? "On" : "Off"}</Badge>
              }
            />
          );
        })}
        {canAdd ? (
          <SettingsRow
            href="/dashboard/settings/payments/add"
            tile={<IconTile icon={PlusIcon} tone="gray" />}
            label="Add payment method"
            description={added.length === 0 ? "No methods yet. Add one to take payments." : "Cash, e-Transfer or card"}
            emphasis
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup title="Checkout rules">
        <SettingsRow
          href="/dashboard/settings/payments/checkout-rules"
          tile={<IconTile icon={ReceiptIcon} tone="sky" />}
          label="Taxes"
          description={
            customizedProvinces === 0
              ? "By delivery province, standard rates"
              : `By delivery province, ${customizedProvinces} customized`
          }
        />
      </SettingsGroup>
    </SettingsColumns>
  );
}

function PaymentsHubSkeleton() {
  return (
    <SettingsColumns>
      <SettingsGroupSkeleton rows={MANUAL_IDS.size + 1} />
      <SettingsGroupSkeleton rows={1} />
    </SettingsColumns>
  );
}
