"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { mealPlanKey, type CustomMealItem } from "@/lib/custom-meal/composition";
import { customMealSchema, findOrCreateCustomMealSize, priceCustomComposition } from "@/lib/services/custom-meal.service";
import { currentUserId } from "@/lib/services/session-service";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { reassignOrder, startAllMigratedOrders, type CreateOrderInput } from "@/lib/services/orders.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

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

export async function previewCustomMeal(
  raw: unknown,
  basePriceOverride?: number | null,
): Promise<{ name: string; perTiffin: number } | { error: string }> {
  await requireStaff();
  const parsed = customMealSchema.safeParse({ items: raw, basePriceOverride });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid custom meal" };
  try {
    const { name, perTiffin } = await priceCustomComposition(parsed.data.items, parsed.data.basePriceOverride);
    return { name, perTiffin };
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
}): Promise<ActionResult<{ publicId: string; deploymentId: string }>> {
  return runAction(async () => {
    await requireStaff();
    const parsedCustom = input.customMeal ? customMealSchema.safeParse(input.customMeal) : null;
    if (parsedCustom && !parsedCustom.success) {
      throw new ValidationError(`Custom meal: ${parsedCustom.error.issues[0]?.message ?? "invalid"}`);
    }
    const customMeal = parsedCustom?.data ?? null;
    const email = input.contact.email?.trim();
    if (!email) throw new ValidationError("Email is required");
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
      // Priced first so an unpriced composition never leaves a custom size behind.
      const priced = await priceCustomComposition(customMeal.items, customMeal.basePriceOverride);
      // The client's size and plan are ignored: the composition decides both.
      const size = await findOrCreateCustomMealSize(customMeal.items, { actorId: await currentUserId() });
      const planKey = mealPlanKey(priced.items);
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
  });
}

export async function reassignOrderAction(orderId: string, ownerId: string): Promise<void> {
  await requireStaff();
  await reassignOrder(orderId, ownerId);
  revalidatePath("/dashboard/orders");
}

// Switch-over day: every WordPress plan still waiting starts from `fromDate` (or its own later
// next-due date). Admin only: it schedules deliveries for every migrated customer at once.
export async function startAllMigratedAction(
  fromDate: string,
): Promise<ActionResult<{ started: number; failed: { deploymentId: string; error: string }[] }>> {
  const res = await runAction(async () => {
    await requireAdmin();
    return startAllMigratedOrders(fromDate);
  });
  revalidatePath("/dashboard/orders");
  return res;
}
