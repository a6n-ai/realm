"use server";

import { auth } from "@/lib/auth";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";

export type ConfirmInput = CreateOrderInput;

export async function confirmSubscription(input: ConfirmInput): Promise<{ deploymentId: string; publicId: string }> {
  const session = await auth();
  // session.user.id is the acting user's public_id; createOrder resolves it to
  // the internal bigint. A logged-in customer's checkout attaches to their own
  // account; anonymous checkout provisions by phone.
  const userId = session?.user?.id ?? null;
  return createOrder(input, { actorId: userId, ownerUserId: userId });
}
