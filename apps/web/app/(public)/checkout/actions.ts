"use server";

import { auth } from "@/lib/auth";
import { createOrder, type CreateOrderInput } from "@/lib/services/orders.service";

export type ConfirmInput = CreateOrderInput;

export async function confirmSubscription(input: ConfirmInput): Promise<{ deploymentId: string }> {
  const session = await auth();
  return createOrder(input, session?.user?.id ?? null);
}
