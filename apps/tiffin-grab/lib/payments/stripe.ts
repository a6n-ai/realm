import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { createLogger } from "@foundry/commons/logger";
import { findMethod } from "@foundry/payments";
import {
  getStripe,
  StripeNotConfiguredError,
  type ConnectDeps,
  type StripeCustomerStore,
  type StripePluginConfig,
} from "@foundry/payments/stripe";
import { db } from "@/db/client";
import { payments, users } from "@/db/schema";
import {
  getIntegrationsConfigFresh,
  getPaymentConfig,
  setIntegrationsConfig,
} from "@/lib/services/app-settings.service";

const log = createLogger("payments.stripe");

export const stripeDeps: ConnectDeps = {
  // get is uncached; set evicts the shared cache (appSettingsEntity.update).
  store: { get: getIntegrationsConfigFresh, set: setIntegrationsConfig },
  masterKey: () => process.env.INTEGRATIONS_ENCRYPTION_KEY,
  hasOpenPayments: async () => {
    const [row] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.method, "stripe"),
          inArray(payments.status, ["awaiting_payment", "rejected"]),
          isNotNull(payments.providerRef),
        ),
      )
      .limit(1);
    return !!row;
  },
};

export const customerStore: StripeCustomerStore = {
  async get(userRef) {
    const [u] = await db
      .select({ id: users.stripeCustomerId })
      .from(users)
      .where(eq(users.publicId, userRef))
      .limit(1);
    return u?.id ?? null;
  },
  async set(userRef, customerId) {
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.publicId, userRef));
  },
};

export async function clearStripeCustomer(userRef: string): Promise<void> {
  await db.update(users).set({ stripeCustomerId: null }).where(eq(users.publicId, userRef));
}

// cus_ ids belong to one Stripe account and mode; after a switch every stored id is dead.
export async function clearStripeCustomers(): Promise<void> {
  await db.update(users).set({ stripeCustomerId: null }).where(isNotNull(users.stripeCustomerId));
}

/** Null when Stripe is not usable right now. Callers hide the card option instead of failing. */
export async function stripeRuntime(): Promise<{ stripe: Stripe; cfg: StripePluginConfig } | null> {
  try {
    return await getStripe(stripeDeps);
  } catch (e) {
    if (!(e instanceof StripeNotConfiguredError)) log.error({ err: e }, "stripe runtime unavailable");
    return null;
  }
}

export async function stripeMethodAvailable(): Promise<boolean> {
  const method = findMethod(await getPaymentConfig(), "stripe");
  return !!method?.enabled && (await stripeRuntime()) != null;
}

// BETTER_AUTH_URL base, as lib/clover/redirect-uri.ts: the request host is unreliable behind a proxy.
export function appBaseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "").trim().replace(/\/$/, "");
}

export const payLink = (paymentPublicId: string): string => `${appBaseUrl()}/me/pay/${paymentPublicId}`;

/** The customer pay page for a card payment, null for any other method. Lets client code show the link without the server-only base URL. */
export async function stripePayLink(paymentPublicId: string): Promise<string | null> {
  const [row] = await db.select({ method: payments.method }).from(payments).where(eq(payments.publicId, paymentPublicId)).limit(1);
  return row?.method === "stripe" ? payLink(paymentPublicId) : null;
}

export async function webhookUrl(): Promise<string> {
  return `${appBaseUrl()}/api/webhooks/stripe`;
}

export const toCents = (d: number | string): number => Math.round(Number(d) * 100);
export const fromCents = (c: number): string => (c / 100).toFixed(2);
