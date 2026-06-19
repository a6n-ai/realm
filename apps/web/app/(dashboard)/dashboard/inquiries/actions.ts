"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService, type InquiryStage } from "@/lib/services/inquiries.service";

export async function createInquiry(input: {
  fullName: string;
  phone: string;
  email?: string;
  source?: string;
  notes?: string;
}) {
  await requireStaff();
  const inq = await inquiriesService.create(input);
  revalidatePath("/dashboard/inquiries");
  return { id: inq.id };
}

export async function setStage(inquiryId: string, toStage: InquiryStage) {
  await requireStaff();
  await inquiriesService.changeStage(inquiryId, toStage);
  revalidatePath("/dashboard/inquiries");
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}

export async function addNote(inquiryId: string, note: string) {
  await requireStaff();
  await inquiriesService.addNote(inquiryId, note);
  revalidatePath(`/dashboard/inquiries/${inquiryId}`);
}
