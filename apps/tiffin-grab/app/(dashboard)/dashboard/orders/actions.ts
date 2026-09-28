"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
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

export async function createOrderFlow(input: {
  source: Source;
  contact: Contact;
  interest?: Interest;
  pickedInquiryId?: string;
  order: CreateOrderInput;
}): Promise<{ publicId: string; deploymentId: string }> {
  await requireStaff();
  const email = input.contact.email?.trim();
  if (!email) throw new Error("Email is required");
  const inquiryId = await inquiriesService.resolveForSource({
    phone: input.contact.phone,
    sourceKey: input.source.sourceKey,
    contact: { fullName: input.contact.fullName, email },
    interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
    pickedId: input.pickedInquiryId,
  });
  const result = await inquiriesService.convert(
    inquiryId,
    {
      ...input.order,
      contact: { ...input.order.contact, email },
    },
    {
      allowAdditionalOrder: true,
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
