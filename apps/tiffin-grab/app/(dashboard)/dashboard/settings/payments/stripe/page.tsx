import { notFound } from "next/navigation";
import { listTaxCodes, parseStripeConfig } from "@foundry/payments/stripe";
import { requirePermission } from "@/lib/auth/guards";
import { stripeRuntime } from "@/lib/payments/stripe";
import { getIntegrationsConfig } from "@/lib/services/app-settings.service";
import { StripeSettingsForm, type StripeView } from "./stripe-settings-form";

export default async function StripeSettingsPage() {
  await requirePermission({ settings: ["read"] });
  const blob = await getIntegrationsConfig();
  const raw = blob["stripe"] as { installed?: boolean } | undefined;
  if (!raw?.installed) notFound();

  const cfg = parseStripeConfig(raw);
  const rt = await stripeRuntime();
  let taxCodes: StripeView["taxCodes"] = [];
  if (rt) {
    try {
      taxCodes = (await listTaxCodes(rt.stripe)).filter((c) => /food|meal|prepared/i.test(`${c.name} ${c.description}`));
    } catch {
      taxCodes = [];
    }
  }

  // Redacted: no key, envelope, webhook secret or publishable key crosses to the client.
  const view: StripeView = {
    connected: !!cfg.accountId,
    unhealthy: !!cfg.accountId && rt == null,
    hint: cfg.secretKeyHint ?? null,
    livemode: cfg.livemode ?? false,
    accountId: cfg.accountId ?? null,
    lastEventAt: cfg.lastEventAt ?? null,
    methodLabel: cfg.methodLabel,
    tax: cfg.tax,
    surcharge: cfg.surcharge,
    taxCodes,
  };
  return <StripeSettingsForm view={view} />;
}
