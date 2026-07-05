"use server";

import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { searchCustomers as searchCustomersQuery, findExistingByContact } from "@/lib/services/customers.service";

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

// Duplicate guard: does a customer already own this phone/email? Staff must reuse
// them (via search) rather than re-entering their contact as a new lead/order.
export async function findCustomerByContact(
  phone: string,
  email?: string,
): Promise<{ publicId: string; fullName: string } | null> {
  await requireStaff();
  const p = phone.trim();
  const e = email?.trim();
  if (p.length < 6 && !(e && e.length > 2)) return null;
  return findExistingByContact(p, e || undefined);
}
