"use server";

import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { resolveAndPersist } from "@foundry/places";
import { getSession } from "@/lib/auth/session";
import { currentUserId } from "@/lib/services/session-service";
import { getContactOnFile } from "@/lib/services/contact-on-file";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";
import { sendAccountSetupEmail } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { findZone } from "@/lib/catalog/zone-match";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { createWebsiteInquiry } from "@/app/(marketing)/contact/actions";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

export type ConfirmInput = CreateOrderInput & {
  /** Set by checkout when the customer came from /me/renew. */
  renewal?: boolean;
};

// A served checkout returns the created order; an out-of-zone one creates no
// order and takes no payment — it's captured as a waitlist inquiry instead.
export type ConfirmResult =
  | { waitlisted: false; deploymentId: string; publicId: string }
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

async function placeSubscription(rawInput: ConfirmInput): Promise<ConfirmResult> {
  // Resolve the contact FIRST: serviceability, geocoding and tax below must all
  // run against the identity and address the order will actually be placed with.
  const { renewal: _renewal, ...rest } = rawInput;
  const input: CreateOrderInput = { ...rest, contact: await resolveContact(rawInput) };

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
