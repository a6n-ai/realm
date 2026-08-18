"use server";

import { ValidationError } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
import { getSession } from "@/lib/auth/session";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";
import { sendAccountSetupEmail } from "@/lib/services/customers.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { createWebsiteInquiry } from "@/app/(marketing)/contact/actions";

export type ConfirmInput = CreateOrderInput;

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

export async function confirmSubscription(input: ConfirmInput): Promise<ConfirmResult> {
  // Serviceability is the source of truth here, not on the client: the checkout
  // UI disables "Continue to payment" for a known out-of-zone postal, but that
  // check is optional (a skipped/edited postal leaves it null). Enforce it server
  // side so a non-serviceable checkout NEVER creates an order or takes payment —
  // capture the lead as a waitlist inquiry instead.
  const { zones } = await loadCatalogSnapshot();
  if (matchZone(input.contact.postalCode, zones) == null) {
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
  // Defense-in-depth: rep coupons flow only through the staff convert path. Never
  // honor a repCoupon arriving on the public checkout payload — even from a
  // logged-in member whose owner==actor check would otherwise pass — so the role
  // boundary is explicit rather than incidental.
  const result = await createOrder({ ...input, repCoupon: null }, { actorId: userId, ownerUserId: userId });
  await maybeSendAccountSetup(input.contact.email);
  return { waitlisted: false, ...result };
}
