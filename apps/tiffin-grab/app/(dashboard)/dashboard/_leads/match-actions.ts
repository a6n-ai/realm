"use server";

import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { searchCustomers as searchCustomersQuery } from "@/lib/services/customers.service";

export async function findInquiryMatches(phone: string) {
  await requireStaff();
  if (!phone || phone.trim().length < 6) return [];
  return inquiriesService.findOpenByPhone(phone);
}

export type CustomerHit = { publicId: string; fullName: string | null; phone: string | null; email: string | null };

export async function searchCustomers(query: string): Promise<CustomerHit[]> {
  await requireStaff();
  if (!query || query.trim().length < 2) return [];
  return searchCustomersQuery(query);
}
