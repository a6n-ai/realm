"use server";

import { auth } from "@/lib/auth";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";

export type ConfirmInput = CreateOrderInput;

export async function confirmSubscription(input: ConfirmInput): Promise<{ deploymentId: string }> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  // A logged-in customer's checkout attaches to their own account; anonymous
  // checkout provisions by phone.
  return createOrder(input, { actorId: userId, ownerUserId: userId });
}
