"use server";

import { ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
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
  if (!fullName) throw new ValidationError("Name is required");
  const parsedPhone = phoneSchema().safeParse(input.phone.trim());
  if (!parsedPhone.success) throw new ValidationError("Invalid phone number");
  const phone = parsedPhone.data;
  let email: string | null = null;
  if (input.email?.trim()) {
    const parsedEmail = emailSchema.safeParse(input.email);
    if (!parsedEmail.success) throw new ValidationError("Enter a valid email");
    email = parsedEmail.data;
  }

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
    email,
    source: "website",
    notes: input.message?.trim() || null,
    prefs: { servedZone, waitlisted },
  });

  return { ok: true, waitlisted };
}
