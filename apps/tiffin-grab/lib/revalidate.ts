import { revalidatePath } from "next/cache";

/** What an order change also stales beyond the order's own page. */
type OrderReach = { payments?: boolean; wallet?: boolean; dashboard?: boolean; orderList?: boolean; customerApp?: boolean };

export function revalidateOrder(orderId: string, reach: OrderReach = {}) {
  revalidatePath(`/dashboard/orders/${orderId}`);
  if (reach.payments) revalidatePath("/dashboard/payments", "layout");
  if (reach.wallet) revalidatePath("/me/wallet");
  if (reach.dashboard) revalidatePath("/dashboard");
  if (reach.orderList) revalidatePath("/dashboard/orders");
  if (reach.customerApp) revalidatePath("/me", "layout");
}

/** Delivery charges and zones feed the charges page, the frequency catalog and checkout's quote. */
export function revalidateDelivery({ charges = true, frequencies = true }: { charges?: boolean; frequencies?: boolean } = {}) {
  if (charges) revalidatePath("/dashboard/delivery/charges");
  if (frequencies) revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
}
