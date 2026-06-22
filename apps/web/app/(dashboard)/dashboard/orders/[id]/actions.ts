"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { activateOrder, cancelOrder, pauseOrder, resumeOrder } from "@/lib/services/orders.service";

export async function activate(orderId: string) {
  await requireStaff();
  await activateOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function cancel(orderId: string) {
  await requireStaff();
  await cancelOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function pause(orderId: string, window: { from: string; until: string }) {
  await requireStaff();
  await pauseOrder(orderId, window);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
export async function resume(orderId: string) {
  await requireStaff();
  await resumeOrder(orderId);
  revalidatePath(`/dashboard/orders/${orderId}`);
}
