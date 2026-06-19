"use server";

import { ValidationError } from "@tiffin/commons";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { isValidCaPhone } from "@/lib/services/users-contact";
import { inquiriesService } from "@/lib/services/inquiries.service";

export interface ContactInput {
  fullName: string;
  phone: string;
  email?: string;
  postalCode?: string;
  message?: string;
  company?: string; // honeypot — real users never see/fill this
}

export async function createWebsiteInquiry(input: ContactInput): Promise<{ ok: true; waitlisted: boolean }> {
  // Honeypot: a filled hidden field means a bot — accept silently, write nothing.
  if (input.company && input.company.trim() !== "") return { ok: true, waitlisted: false };

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  if (!fullName) throw new ValidationError("Name is required");
  if (!isValidCaPhone(phone)) throw new ValidationError("Invalid phone number");

  let servedZone: string | null = null;
  const hasPostal = !!input.postalCode?.trim();
  if (hasPostal) {
    const { zones } = await loadCatalogSnapshot();
    servedZone = matchZone(input.postalCode!, zones)?.name ?? null;
  }
  const waitlisted = hasPostal ? servedZone === null : false;

  await inquiriesService.create({
    fullName,
    phone,
    email: input.email?.trim() || null,
    source: "website",
    notes: input.message?.trim() || null,
    prefs: { servedZone, waitlisted },
  });

  return { ok: true, waitlisted };
}
