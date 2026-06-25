"use server";

import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";

export async function findInquiryMatches(phone: string) {
  await requireStaff();
  if (!phone || phone.trim().length < 6) return [];
  return inquiriesService.findOpenByPhone(phone);
}
