"use server";
import { NotFoundError } from "@realm/commons";
import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/services/session-service";
import { assertOwnsDelivery, assertOwnsOrder } from "@/lib/services/customer-deliveries.service";
import { skipDelivery, unskipDelivery, setDeliveryAddress, clearDeliveryAddress } from "@/lib/services/deliveries.service";
import { pauseOrder, resumeOrder } from "@/lib/services/orders.service";

async function me(): Promise<bigint> {
  const id = await currentUserId();
  if (id == null) throw new NotFoundError("Not signed in");
  return id;
}

export async function skipMyDelivery(deliveryPublicId: string) {
  const userId = await me();
  await assertOwnsDelivery(userId, deliveryPublicId); // IDOR gate — before the mutation
  await skipDelivery(deliveryPublicId);
  revalidatePath("/me/deliveries");
}

export async function unskipMyDelivery(deliveryPublicId: string) {
  const userId = await me();
  await assertOwnsDelivery(userId, deliveryPublicId);
  await unskipDelivery(deliveryPublicId);
  revalidatePath("/me/deliveries");
}

export async function setMyDeliveryAddress(
  deliveryPublicId: string,
  input: { fullName: string; addressLine: string; city: string; postalCode: string },
) {
  const userId = await me();
  await assertOwnsDelivery(userId, deliveryPublicId);
  await setDeliveryAddress(deliveryPublicId, input);
  revalidatePath("/me/deliveries");
}

export async function clearMyDeliveryAddress(deliveryPublicId: string) {
  const userId = await me();
  await assertOwnsDelivery(userId, deliveryPublicId);
  await clearDeliveryAddress(deliveryPublicId);
  revalidatePath("/me/deliveries");
}

export async function pauseMySubscription(orderPublicId: string, window: { from: string; until: string }) {
  const userId = await me();
  await assertOwnsOrder(userId, orderPublicId);
  await pauseOrder(orderPublicId, window);
  revalidatePath("/me/deliveries");
}

export async function resumeMySubscription(orderPublicId: string) {
  const userId = await me();
  await assertOwnsOrder(userId, orderPublicId);
  await resumeOrder(orderPublicId);
  revalidatePath("/me/deliveries");
}
