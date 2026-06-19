"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import type { CreateOrderInput } from "@/lib/services/orders.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { priceSubscription, type PricingResult } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";

export async function previewPrice(input: CreateOrderInput): Promise<PricingResult> {
  await requireStaff();
  const snap = await loadCatalogSnapshot();
  return priceSubscription(input.selections, buildPricingCatalog(snap, input.selections));
}

export async function convertInquiry(inquiryId: string, input: CreateOrderInput): Promise<void> {
  await requireStaff();
  const { deploymentId } = await inquiriesService.convert(inquiryId, input);
  redirect(`/activate/${deploymentId}`);
}
