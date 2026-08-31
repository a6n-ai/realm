"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import {
  linkCustomerToClover,
  pushCustomerToClover,
  searchCloverCustomersForMatch,
} from "@/lib/services/customers.service";
import type { CloverCustomerRow } from "@/lib/services/customers.repository";

/** Existing Clover customers matching a search, for the "match before create" dialog. */
export async function searchCloverCustomersAction(query: string): Promise<CloverCustomerRow[]> {
  await requirePermission({ user: ["list"] });
  return searchCloverCustomersForMatch(query);
}

/** Link to an existing Clover customer instead of creating a new one. */
export async function linkCustomerToCloverAction(
  publicId: string,
  cloverCustomerId: string,
): Promise<void> {
  await requirePermission({ user: ["list"] });
  await linkCustomerToClover(publicId, cloverCustomerId);
  revalidatePath("/dashboard/customers");
}

/** No match found — create a brand-new Clover customer for this row. */
export async function pushCustomerToCloverAction(
  publicId: string,
): Promise<Awaited<ReturnType<typeof pushCustomerToClover>>> {
  await requirePermission({ user: ["list"] });
  const result = await pushCustomerToClover(publicId);
  revalidatePath("/dashboard/customers");
  return result;
}
