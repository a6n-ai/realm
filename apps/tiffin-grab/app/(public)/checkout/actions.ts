"use server";

import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { resolveAndPersist } from "@foundry/places";
import { getSession } from "@/lib/auth/session";
import { currentUserId } from "@/lib/services/session-service";
import { getContactOnFile } from "@/lib/services/contact-on-file";
import { assertOnePerson, createOrder, type CreateOrderInput } from "@/lib/services/orders.service";
import { usersService } from "@/lib/services/users.service";
import { sendAccountSetupEmail } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { findZone } from "@/lib/catalog/zone-match";
import { parseCanadianPostalCode } from "@/lib/catalog/postal";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { createWebsiteInquiry } from "@/app/(marketing)/contact/actions";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import type { CardSource, PayByCardResult } from "@/lib/services/payment-stripe";

export type ConfirmInput = CreateOrderInput & {
  /** Set by checkout when the customer came from /me/renew. */
  renewal?: boolean;
};

// A served checkout returns the created order; an out-of-zone one creates no
// order and takes no payment — it's captured as a waitlist inquiry instead.
export type ConfirmResult =
  | { waitlisted: false; deploymentId: string; publicId: string; paymentPublicId: string }
  | { waitlisted: true };

const log = createLogger("checkout");

/**
 * A checkout that provisions a brand-new customer (no credential row yet) gets a
 * "set your password" email — a verification link that, via
 * autoSignInAfterVerification, signs them in and lands on /set-password. Keyed on
 * the absence of a credential, not on a flag, so it can't fire at someone who
 * already has a password. Best-effort: never fails the order.
 */
async function maybeSendAccountSetup(email: string | undefined | null): Promise<void> {
  if (!email) return;
  try {
    await sendAccountSetupEmail(email);
  } catch (err) {
    // A password already set / customer not found is the expected steady
    // state, not a failure — only log real send errors.
    if (err instanceof ValidationError) return;
    log.error({ err }, "account-setup email failed");
  }
}

/**
 * A signed-in customer's identity is their account's, never the request's: name
 * and email are always re-taken from the session, so a crafted payload cannot
 * place an order under someone else's contact. Phone, address and delivery
 * instructions are accepted as entered (validated downstream by createOrder) and
 * apply to this order only; nothing is written back to the profile.
 */
async function resolveContact(input: ConfirmInput): Promise<CreateOrderInput["contact"]> {
  const session = await getSession();
  const user = session?.user;
  // No guest orders: the /subscribe email step signs everyone in first, so an
  // order always has an owner who can see payment details and upload proof.
  if (!user) throw new ValidationError("Sign in to place your order.");
  const userId = await currentUserId();
  const fullName = userId == null ? undefined : (await getContactOnFile(userId))?.fullName?.trim();
  if (!user.email || !fullName) throw new ValidationError("Your account is missing a name or email. Update it from Account.");
  if (!input.contact.addressLine?.trim() || !input.contact.postalCode?.trim()) {
    throw new ValidationError("Enter your delivery address.");
  }
  return { ...input.contact, fullName, email: user.email };
}

// Returned, never thrown: a thrown ValidationError (staff email, missing address,
// weekend start, ...) reaches the browser as a message-less React error #441.
export async function confirmSubscription(rawInput: ConfirmInput): Promise<ActionResult<ConfirmResult>> {
  return runAction(() => placeSubscription(rawInput));
}

export type PayCheckoutInput = ConfirmInput & { paymentPublicId: string | null; source: CardSource; acceptSurcharge: boolean };

/**
 * The card order is created only when the customer presses Pay. A retry (declined card, 3DS
 * abandoned) passes the payment it got back and reuses that order at the server's own quote;
 * changed inputs pass null and get a fresh order, which cancels the older unpaid one.
 */
export async function payCheckout(
  input: PayCheckoutInput,
): Promise<ActionResult<{ paymentPublicId: string; deploymentId: string; result: PayByCardResult }>> {
  return runAction(async () => {
    const { paymentPublicId: reuseId, source, acceptSurcharge, ...order } = input;
    if (order.paymentMethodId !== "stripe") throw new ValidationError("Choose card to pay now.");
    const session = await getSession();
    if (!session?.user) throw new ValidationError("Sign in to place your order.");

    let paymentPublicId: string;
    let deploymentId: string;
    const reusable = reuseId ? await findReusableCheckout(reuseId, session.user.id) : null;
    if (reusable) {
      ({ paymentPublicId, deploymentId } = reusable);
    } else {
      const placed = await placeSubscription(order);
      if (placed.waitlisted) throw new ValidationError("We do not deliver to that address yet. We have added you to our waitlist.");
      ({ paymentPublicId, deploymentId } = placed);
    }
    const [{ payByCard }, { appBaseUrl }] = await Promise.all([import("@/lib/services/payment-stripe"), import("@/lib/payments/stripe")]);
    const result = await payByCard({
      paymentPublicId,
      userPublicId: session.user.id,
      source,
      acceptSurcharge,
      returnUrl: `${appBaseUrl()}/me/pay/${paymentPublicId}?return=1`,
    });
    return { paymentPublicId, deploymentId, result };
  });
}

async function findReusableCheckout(paymentPublicId: string, userPublicId: string) {
  // Lazy: keeps the confirm-only path (and its tests) free of the db and Stripe module graph.
  const [{ and, eq, inArray }, { db }, { orders, payments, users }] = await Promise.all([
    import("drizzle-orm"),
    import("@/db/client"),
    import("@/db/schema"),
  ]);
  const [row] = await db
    .select({ deploymentId: orders.deploymentId })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        eq(payments.publicId, paymentPublicId),
        eq(payments.method, "stripe"),
        inArray(payments.status, ["awaiting_payment", "rejected"]),
        eq(orders.status, "pending"),
        eq(users.publicId, userPublicId),
      ),
    )
    .limit(1);
  return row ? { paymentPublicId, deploymentId: row.deploymentId } : null;
}

async function placeSubscription(rawInput: ConfirmInput): Promise<ConfirmResult> {
  // Resolve the contact FIRST: serviceability, geocoding and tax below must all
  // run against the identity and address the order will actually be placed with.
  const { renewal: _renewal, ...rest } = rawInput;
  const contact = await resolveContact(rawInput);
  // A malformed postal code is a typo to fix, not a lead for the waitlist.
  const input: CreateOrderInput = { ...rest, contact: { ...contact, postalCode: parseCanadianPostalCode(contact.postalCode) } };

  // Serviceability is the source of truth here, not on the client: the checkout
  // UI disables "Continue to payment" for a known out-of-zone postal, but that
  // check is optional (a skipped/edited postal leaves it null). Enforce it server
  // side so a non-serviceable checkout NEVER creates an order or takes payment —
  // capture the lead as a waitlist inquiry instead.
  const orgId = await resolveRequestOrg();
  const { zones } = await loadCatalogSnapshot(orgId);
  const address = [input.contact.addressLine, input.contact.city, input.contact.postalCode].filter(Boolean).join(", ");
  if ((await findZone(zones, { postalCode: input.contact.postalCode, address }, orgId)) == null) {
    await createWebsiteInquiry({
      fullName: input.contact.fullName,
      phone: input.contact.phone,
      email: input.contact.email,
      postalCode: input.contact.postalCode,
    });
    return { waitlisted: true };
  }

  assertOnePerson(input);
  const session = await getSession();
  // session.user.id is the acting user's public_id; createOrder resolves it to
  // the internal bigint. A logged-in customer's checkout attaches to their own
  // account; anonymous checkout provisions by phone.
  const userId = session?.user?.id ?? null;

  // The client never sends lat/lng at all — a client could assert any
  // coordinate regardless of the typed address. This is the public checkout
  // entry point (a Server Action a request can call directly), so re-resolve
  // the address text server-side here and store only that result; a resolve
  // failure just stores null.
  const resolvedDelivery = input.contact.addressLine.trim()
    ? await resolveAndPersist({
        address: [input.contact.addressLine, input.contact.city, input.contact.postalCode]
          .filter(Boolean)
          .join(", "),
      }).catch(() => null)
    : null;

  // A plan needs a phone, and it lives on the account: the number confirmed here becomes the
  // account's, so the next checkout (and delivery updates) already have it. Before the order,
  // so a number another account holds fails here instead of after the order exists.
  if (userId) await usersService.updateContact(userId, { phone: input.contact.phone ?? "" });

  // Defense-in-depth: rep coupons flow only through the staff convert path. Never
  // honor a repCoupon arriving on the public checkout payload — even from a
  // logged-in member whose owner==actor check would otherwise pass — so the role
  // boundary is explicit rather than incidental.
  const result = await createOrder(
    {
      ...input,
      contact: { ...input.contact, lat: resolvedDelivery?.lat ?? null, lng: resolvedDelivery?.lng ?? null },
      repCoupon: null,
    },
    { actorId: userId, ownerUserId: userId, orgId },
  );
  await maybeSendAccountSetup(input.contact.email);
  return { waitlisted: false, ...result };
}
