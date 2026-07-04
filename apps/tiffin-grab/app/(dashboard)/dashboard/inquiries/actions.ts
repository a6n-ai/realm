"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import {
  inquiriesService,
  type ActivityType,
  type InquiryStage,
  type LostReason,
} from "@/lib/services/inquiries.service";

export async function createInquiry(input: {
  fullName: string;
  phone: string;
  email?: string;
  sourceKey: string;
  subSourceKey?: string;
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number;
  postalCode?: string;
  preferredStart?: string;
  quotedPrice?: number;
  notes?: string;
}) {
  await requireStaff();
  const inq = await inquiriesService.create(input);
  revalidatePath("/dashboard/inquiries");
  return { publicId: inq.publicId };
}

export async function setStage(
  inquiryId: string,
  toStage: InquiryStage,
): Promise<{ previous: InquiryStage }> {
  await requireStaff();
  const { previous } = await inquiriesService.changeStage(inquiryId, toStage);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  return { previous: previous as InquiryStage };
}

export async function logActivity(
  inquiryId: string,
  input: { type: ActivityType; outcome?: string; note?: string; nextFollowUpAt?: number },
) {
  await requireStaff();
  await inquiriesService.logActivity(inquiryId, input);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}

export async function markLost(inquiryId: string, reason: LostReason, note?: string) {
  await requireStaff();
  await inquiriesService.markLost(inquiryId, reason, note);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
  revalidatePath("/dashboard/inquiries");
}

export async function addNote(inquiryId: string, note: string) {
  await requireStaff();
  await inquiriesService.addNote(inquiryId, note);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}
