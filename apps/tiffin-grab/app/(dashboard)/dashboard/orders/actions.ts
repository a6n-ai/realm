"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { compositionName, mealPlanKey, normalizeItems, type CustomMealItem } from "@/lib/custom-meal/composition";
import { computeCustomPerTiffin } from "@/lib/custom-meal/pricing";
import { findOrCreateCustomMealSize, loadCategoryUnits, loadPricingRows } from "@/lib/services/custom-meal.service";
import { currentUserId } from "@/lib/services/session-service";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { reassignOrder, type CreateOrderInput } from "@/lib/services/orders.service";

type Source = { sourceKey: string; subSourceKey?: string };
type Contact = { fullName: string; phone: string; email: string };
type Interest = {
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
  frequencyKeyInterest?: string;
  eatingDaysInterest?: string[];
  postalCode?: string;
  preferredStart?: string;
  quotedPrice?: number;
};

const itemsSchema = z.array(z.object({
  category: z.string().trim().min(1),
  planKey: z.enum(["veg", "non-veg"]),
  tuAmount: z.number().finite().positive().max(50),
})).min(1).max(20);

const customMealSchema = z.object({
  items: itemsSchema,
  basePriceOverride: z.number().finite().positive().max(1000).nullable().optional(),
});

export async function previewCustomMeal(raw: unknown): Promise<{ name: string; perTiffin: number } | { error: string }> {
  await requireStaff();
  const parsed = itemsSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid custom meal" };
  const [units, pricing] = await Promise.all([loadCategoryUnits(), loadPricingRows()]);
  try {
    const items = normalizeItems(parsed.data, units);
    return { name: compositionName(items, units), perTiffin: computeCustomPerTiffin(items, pricing.filter((p) => p.active)) };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
}

export async function createOrderFlow(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
  order: CreateOrderInput;
  customMeal?: { items: CustomMealItem[]; basePriceOverride?: number | null };
}): Promise<{ publicId: string; deploymentId: string }> {
  await requireStaff();
  const parsedCustom = input.customMeal ? customMealSchema.safeParse(input.customMeal) : null;
  if (parsedCustom && !parsedCustom.success) {
    throw new ValidationError(`Custom meal: ${parsedCustom.error.issues[0]?.message ?? "invalid"}`);
  }
  const customMeal = parsedCustom?.data ?? null;
  const email = input.contact.email?.trim();
  if (!email) throw new Error("Email is required");
  const inquiryId = await inquiriesService.resolveForSource({
    phone: input.contact.phone,
    sourceKey: input.source.sourceKey,
    contact: { fullName: input.contact.fullName, email },
    interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
    pickedId: input.pickedInquiryId,
  });
  let order = input.order;
  let customOpts: { allowCustomMeal?: boolean; basePriceOverride?: number } = {};
  if (customMeal) {
    // The client's size and plan are ignored: the composition decides both.
    const size = await findOrCreateCustomMealSize(customMeal.items, { actorId: await currentUserId() });
    const planKey = mealPlanKey(normalizeItems(customMeal.items, await loadCategoryUnits()));
    order = { ...order, planKey, selections: { ...order.selections, mealSizeId: size.publicId } };
    customOpts = {
      allowCustomMeal: true,
      ...(customMeal.basePriceOverride != null ? { basePriceOverride: customMeal.basePriceOverride } : {}),
    };
  }
  const result = await inquiriesService.convert(
    inquiryId,
    {
      ...order,
      contact: { ...order.contact, email },
    },
    {
      allowAdditionalOrder: true,
      ...customOpts,
    },
  );
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/inquiries");
  return result;
}

export async function reassignOrderAction(orderId: string, ownerId: string): Promise<void> {
  await requireStaff();
  await reassignOrder(orderId, ownerId);
  revalidatePath("/dashboard/orders");
}
