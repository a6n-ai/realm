import { Suspense } from "react";
import { StripeSettingsSkeleton } from "./stripe-settings-skeleton";
import { notFound } from "next/navigation";
import { listTaxCodes, parseStripeConfig } from "@foundry/payments/stripe";
import { requirePagePermission } from "@/lib/auth/guards";
import { stripeRuntime } from "@/lib/payments/stripe";
import { findMethod } from "@foundry/payments";
import { getIntegrationsConfig } from "@/lib/payments/integrations-config";
import { getPaymentConfig } from "@/lib/payments/payment-config";
import { PaymentsBackLink } from "../back-link";
import { StripeSettingsForm, type StripeView } from "./stripe-settings-form";

export default async function StripeSettingsPage() {
  await requirePagePermission({ finance: ["manage"] });
  const blob = await getIntegrationsConfig();
  const raw = blob["stripe"] as { installed?: boolean } | undefined;
  if (!raw?.installed) notFound();

  return (
    <div className="grid gap-4">
      <PaymentsBackLink />
      <Suspense fallback={<StripeSettingsSkeleton />}>
        <StripeSettingsLoader raw={raw} />
      </Suspense>
    </div>
  );
}

async function StripeSettingsLoader({ raw }: { raw: unknown }) {
  const cfg = parseStripeConfig(raw);
  const [rt, payCfg] = await Promise.all([stripeRuntime(), getPaymentConfig()]);
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
    enabled: !!findMethod(payCfg, "stripe")?.enabled,
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

