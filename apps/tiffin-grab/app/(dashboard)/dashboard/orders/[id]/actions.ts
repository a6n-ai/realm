"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { activateOrder, cancelOrder, rejectPayment, verifyPayment } from "@/lib/services/orders.service";
import { getSession } from "@/lib/auth/session";

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

export async function verifyPaymentAction(orderId: string, paymentPublicId: string) {
  await requireStaff();
  const session = await getSession();
  await verifyPayment(paymentPublicId, { actorId: session?.user?.id ?? null });
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/me/wallet");
}

export async function rejectPaymentAction(orderId: string, paymentPublicId: string, note: string) {
  await requireStaff();
  await rejectPayment(paymentPublicId, note);
  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/me/wallet");
}
