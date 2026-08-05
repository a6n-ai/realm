"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { normalizeCouponCode } from "@/lib/orders/discounts";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

const schema = z.object({
  publicId: z.string().min(1),
  publicOffer: z.boolean(),
  // Letters, digits, dash and underscore only: a code with a space or a slash is
  // one customers mistype and support has to explain.
  couponCode: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9_-]*$/, "Use letters, numbers, - and _ only")
    .optional()
    .nullable(),
});

/**
 * The money still comes from the synced Clover discount — this only controls
 * whether customers may claim it, and under what code.
 *
 * Server Actions must RETURN errors: throwing gives the client a digest-only
 * crash with no message to show.
 */
export async function updateDiscountOffer(input: unknown): Promise<{ ok: true } | { error: string }> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  const code = parsed.data.couponCode?.trim();
  try {
    await inventoryCatalogService.discounts.update(parsed.data.publicId, {
      publicOffer: parsed.data.publicOffer,
      couponCode: code ? normalizeCouponCode(code) : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not save";
    // The unique index is the real guard against two discounts sharing a code.
    return { error: /unique|duplicate/i.test(msg) ? "That code is already in use" : msg };
  }
  revalidatePath("/dashboard/clover/discounts");
  return { ok: true };
}
