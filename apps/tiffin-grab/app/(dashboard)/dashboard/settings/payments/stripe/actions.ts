"use server";

import { ValidationError } from "@foundry/commons";
import { findMethod, paymentConfigSaveError } from "@foundry/payments";
import {
  connectStripe,
  readStripeConfigStrict,
  disconnectStripe,
  updateStripeSettings,
  taxReadiness,
  type StripePluginConfig,
} from "@foundry/payments/stripe";
import { staffAction, type Guard } from "@/lib/actions/staff-action";
import { clearStripeCustomers, stripeDeps, stripeRuntime, webhookUrl } from "@/lib/payments/stripe";
import { ensurePaymentCatalog, getPaymentConfigFresh, setPaymentConfig } from "@/lib/payments/payment-config";
import { getAppSettings } from "@/lib/settings";

const READ: Guard = { settings: ["read"] };
const WRITE: Guard = { settings: ["write"] };

const WRITE_OPTS = {
  guard: WRITE,
  revalidate: [["/dashboard/settings/payments", "layout"], "/dashboard/settings/integrations"],
} as const;

const REJECTED = "Stripe rejected the stored key — use Replace key to reconnect.";

function isStripeKeyRejected(e: unknown): boolean {
  const t = (e as { type?: string } | null)?.type;
  return t === "StripeAuthenticationError" || t === "StripePermissionError";
}

async function setStripeMethodEnabled(enabled: boolean) {
  const cfg = await getPaymentConfigFresh();
  const method = findMethod(cfg, "stripe");
  if (!method) {
    if (!enabled) return;
    throw new ValidationError("Stripe is not installed");
  }
  if (method.enabled === enabled) return;
  const next = { ...cfg, methods: cfg.methods.map((m) => (m.id === "stripe" ? { ...m, enabled } : m)) };
  const error = paymentConfigSaveError(next);
  if (error) throw new ValidationError(error);
  await setPaymentConfig(next);
}

export async function setStripeEnabledAction(enabled: boolean) {
  return staffAction(WRITE_OPTS, async () => {
    if (enabled && !(await stripeRuntime())) throw new ValidationError("Connect Stripe first");
    await setStripeMethodEnabled(enabled);
    // A concurrent Disconnect between the check and the write must not leave Card enabled.
    if (enabled && !(await stripeRuntime())) {
      await setStripeMethodEnabled(false);
      throw new ValidationError("Connect Stripe first");
    }
  });
}

// Results carry only ok/error: never key material.
export async function connectStripeAction(fd: FormData) {
  return staffAction(WRITE_OPTS, async () => {
    const prev = await readStripeConfigStrict(stripeDeps);
    const next = await connectStripe(stripeDeps, {
      secretKey: String(fd.get("secretKey") ?? "").trim(),
      publishableKey: String(fd.get("publishableKey") ?? "").trim(),
      webhookUrl: await webhookUrl(),
    });
    if (prev.accountId && (prev.accountId !== next.accountId || prev.livemode !== next.livemode)) {
      await clearStripeCustomers();
    }
    await ensurePaymentCatalog();
  });
}

export async function disconnectStripeAction() {
  return staffAction(WRITE_OPTS, async () => {
    // Disable first: if a later step fails Card is already off (fail closed).
    await setStripeMethodEnabled(false);
    await disconnectStripe(stripeDeps);
    // Disconnect wipes accountId, so a later Connect cannot tell the account changed.
    await clearStripeCustomers();
  });
}

export async function saveStripeSettingsAction(
  patch: Partial<Pick<StripePluginConfig, "methodLabel" | "tax" | "surcharge">>,
) {
  return staffAction(WRITE_OPTS, async () => {
    if (patch.tax?.enabled) {
      const rt = await stripeRuntime();
      if (!rt || !patch.tax.taxCode) throw new ValidationError("Connect Stripe and pick a tax code first");
      const ready = await taxReadiness(rt.stripe, patch.tax.taxCode, (await getAppSettings()).currency);
      if (!ready.ok) {
        throw new ValidationError("Stripe Tax is not ready: check head office, registrations and the test calculation");
      }
    }
    await updateStripeSettings(stripeDeps, patch);
  });
}

export async function checkTaxReadinessAction(taxCode: string) {
  return staffAction({ guard: READ }, async () => {
    if (!/^txcd_\d+$/.test(taxCode)) throw new ValidationError("Pick a valid tax code");
    const rt = await stripeRuntime();
    if (!rt) throw new ValidationError("Connect Stripe first");
    try {
      return await taxReadiness(rt.stripe, taxCode, (await getAppSettings()).currency);
    } catch (e) {
      if (isStripeKeyRejected(e)) throw new ValidationError(REJECTED);
      throw e;
    }
  });
}

export async function sendTestEventAction() {
  return staffAction(WRITE_OPTS, async () => {
    const rt = await stripeRuntime();
    if (!rt) throw new ValidationError("Connect Stripe first");
    if (rt.cfg.livemode) throw new ValidationError("Test events are only available in test mode");
    // No paymentRef metadata: the webhook takes its ignored path but still stamps lastEventAt.
    try {
      await rt.stripe.paymentIntents.create({
        amount: 50,
        currency: (await getAppSettings()).currency.toLowerCase(),
        confirm: true,
        payment_method: "pm_card_visa",
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      });
    } catch (e) {
      if (isStripeKeyRejected(e)) throw new ValidationError(REJECTED);
      throw e;
    }
    return "Test event sent";
  });
}
