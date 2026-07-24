"use server";

import { NotFoundError, zonedDateIso } from "@realm/commons";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import {
  activateOrder,
  cancelOrder,
  rejectPayment,
  verifyPayment,
} from "@/lib/services/orders.service";
import { assertCanManageOrder, type Subscription } from "@/lib/services/customer-deliveries.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadOrderDeliveriesBundle } from "@/lib/services/order-deliveries-bundle.service";
import { db } from "@/db/client";
import { orders, plans, mealSizes } from "@/db/schema";
import { monthFetchRange, parseMonthParam } from "@/app/(customer)/me/deliveries/calendar-constants";

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

export async function fetchOrderDeliveriesMonth(orderPublicId: string, monthKey: string) {
  await assertCanManageOrder(orderPublicId);

  const [orderRow] = await db
    .select({
      userId: orders.userId,
      publicId: orders.publicId,
      planName: plans.name,
      planType: plans.planType,
      planKey: plans.key,
      status: orders.status,
      fullName: orders.fullName,
      addressLine: orders.addressLine,
      city: orders.city,
      postalCode: orders.postalCode,
      zoneId: orders.zoneId,
      mealSizeName: mealSizes.name,
      persons: orders.persons,
      categoryCounts: orders.categoryCounts,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);

  if (!orderRow?.userId) throw new NotFoundError("Order not found");

  const settings = await getAppSettings();
  const today = zonedDateIso(Date.now(), settings.timezone);
  const parsedMonth = parseMonthParam(monthKey, today);
  const { from, until } = monthFetchRange(parsedMonth, today);

  const subscription: Subscription = {
    publicId: orderRow.publicId,
    planName: orderRow.planName,
    planType: orderRow.planType as "tiffin" | "healthy",
    planKey: orderRow.planKey,
    status: orderRow.status,
    fullName: orderRow.fullName,
    addressLine: orderRow.addressLine,
    city: orderRow.city,
    postalCode: orderRow.postalCode,
    zoneId: orderRow.zoneId,
    mealSizeName: orderRow.mealSizeName,
    persons: orderRow.persons,
    categoryCounts: (orderRow.categoryCounts as Record<string, number> | null) ?? {},
  };

  const bundle = await loadOrderDeliveriesBundle(orderRow.userId, subscription, from, until);
  return { ...bundle, monthKey: parsedMonth, today };
}
