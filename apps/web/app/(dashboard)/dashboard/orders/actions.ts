"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import type { CreateOrderInput } from "@/lib/services/orders.service";

type Source = { sourceKey: string; subSourceKey?: string };
type Contact = { fullName: string; phone: string; email?: string };
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
}): Promise<void> {
  await requireStaff();
  const inquiryId = await inquiriesService.resolveForSource({
    phone: input.contact.phone,
    sourceKey: input.source.sourceKey,
    contact: { fullName: input.contact.fullName, email: input.contact.email },
    interest: { ...input.interest, subSourceKey: input.source.subSourceKey },
    pickedId: input.pickedInquiryId,
  });
  const { deploymentId } = await inquiriesService.convert(inquiryId, input.order);
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/inquiries");
  redirect(`/activate/${deploymentId}`);
}
