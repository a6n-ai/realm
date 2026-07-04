"use server";

import { getSession } from "@/lib/auth/session";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";

export type ConfirmInput = CreateOrderInput;

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
  return createOrder({ ...input, repCoupon: null }, { actorId: userId, ownerUserId: userId });
}
