"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { reassignOrder, type CreateOrderInput } from "@/lib/services/orders.service";

type Source = { sourceKey: string; subSourceKey?: string };
type Contact = { fullName: string; phone: string; email: string };
type Interest = {
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
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
