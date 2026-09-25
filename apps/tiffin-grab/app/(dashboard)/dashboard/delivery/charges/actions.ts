"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  deliveryChargesService,
  type AddressTagInput,
  type DeliveryTypeInput,
} from "@/lib/services/delivery-charges.service";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";

export async function updateBaseChargeAction(amount: number): Promise<number> {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryChargesService.updateBaseDeliveryCharge(amount, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function saveDeliveryTypeAction(input: DeliveryTypeInput) {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryChargesService.saveDeliveryType(input, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function deleteDeliveryTypeAction(id: string) {
  await requireAdmin();
  const result = await deliveryChargesService.deleteDeliveryType(id);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function saveAddressTagAction(input: AddressTagInput) {
  await requireAdmin();
  const orgId = await resolveRequestOrg();
  const result = await deliveryChargesService.saveAddressTag(input, orgId);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}

export async function deleteAddressTagAction(id: string) {
  await requireAdmin();
  const result = await deliveryChargesService.deleteAddressTag(id);
  await invalidateCatalogSnapshot();
  revalidatePath("/dashboard/delivery/charges");
  revalidatePath("/dashboard/catalog/delivery-frequencies");
  revalidatePath("/checkout");
  return result;
}
