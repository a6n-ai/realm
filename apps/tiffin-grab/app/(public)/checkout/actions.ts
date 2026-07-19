"use server";

import { eq } from "drizzle-orm";
import { createLogger } from "@realm/commons/logger";
import { getSession } from "@/lib/auth/session";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";

export type ConfirmInput = CreateOrderInput;

const log = createLogger("checkout");

/**
 * A checkout that provisions a brand-new customer (no password set, email not
 * verified) gets a "set your password" email — a verification link that, via
 * autoSignInAfterVerification, signs them in and lands on /set-password. No temp
 * password, no reset-link re-add. Best-effort: never fails the order.
 */
async function maybeSendAccountSetup(email: string | undefined | null): Promise<void> {
  if (!email) return;
  try {
    const [u] = await db
      .select({ passwordSet: users.passwordSet, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (u && !u.passwordSet && !u.emailVerified) {
      await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/set-password" } });
    }
  } catch (err) {
    log.error({ err }, "account-setup email failed");
  }
}

export async function confirmSubscription(input: ConfirmInput): Promise<{ deploymentId: string; publicId: string }> {
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
  return result;
}
