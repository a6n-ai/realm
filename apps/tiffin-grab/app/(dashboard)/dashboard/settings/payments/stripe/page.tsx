import { Suspense } from "react";
import { notFound } from "next/navigation";
import { listTaxCodes, parseStripeConfig } from "@foundry/payments/stripe";
import { Card } from "@foundry/ui/card";
import { Skeleton } from "@foundry/ui/skeleton";
import { requirePermission } from "@/lib/auth/guards";
import { stripeRuntime } from "@/lib/payments/stripe";
import { findMethod } from "@foundry/payments";
import { getIntegrationsConfig, getPaymentConfig } from "@/lib/services/app-settings.service";
import { PaymentsBackLink } from "../back-link";
import { StripeSettingsForm, type StripeView } from "./stripe-settings-form";

export default async function StripeSettingsPage() {
  await requirePermission({ settings: ["read"] });
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

function StripeSettingsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-6">
        {[3, 4, 4].map((rows, i) => (
          <Card key={i} className="grid gap-4 p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: rows }, (_, j) => (
              <Skeleton key={j} className="h-8 w-full sm:max-w-md" />
            ))}
          </Card>
        ))}
      </div>
      <Card className="order-first grid content-start gap-3 p-5 lg:order-none">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 6 }, (_, j) => (
          <Skeleton key={j} className="h-5 w-full" />
        ))}
      </Card>
    </div>
  );
}
