"use server";

import { ValidationError, phoneSchema, emailSchema } from "@foundry/commons";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { inquiriesService } from "@/lib/inquiries/inquiries.service";
import { trackConversion } from "@/lib/services/tracking";

export interface ContactInput {
  fullName: string;
  phone: string;
  email: string;
  postalCode?: string;
  message?: string;
  company?: string; // honeypot — real users never see/fill this
  /** Shared with the browser Lead so Meta counts the form once. */
  eventId?: string | null;
  eventSourceUrl?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createWebsiteInquiry(input: ContactInput): Promise<{ ok: true; waitlisted: boolean }> {
  // Honeypot: a filled hidden field means a bot — accept silently, write nothing.
  if (input.company && input.company.trim() !== "") return { ok: true, waitlisted: false };

  const fullName = input.fullName.trim();
  if (!fullName) throw new ValidationError("Name is required");
  const parsedPhone = phoneSchema().safeParse(input.phone.trim());
  if (!parsedPhone.success) throw new ValidationError("Invalid phone number");
  const phone = parsedPhone.data;
  // Rejected here because InquiriesService.create throws "Email is required", which would surface as a generic failure.
  if (!input.email?.trim()) throw new ValidationError("Email is required");
  const parsedEmail = emailSchema.safeParse(input.email.trim());
  if (!parsedEmail.success) throw new ValidationError("Enter a valid email");
  const email = parsedEmail.data;

  let servedZone: string | null = null;
  const hasPostal = !!input.postalCode?.trim();
  if (hasPostal) {
    const { zones } = await loadCatalogSnapshot();
    servedZone = matchZone(input.postalCode!, zones)?.name ?? null;
  }
  const waitlisted = hasPostal ? servedZone === null : false;

  const inquiry = await inquiriesService.create({
    fullName,
    phone,
    email,
    sourceKey: "website",
    notes: input.message?.trim() || null,
  });

  const eventId = input.eventId?.trim() ?? "";
  trackConversion(
    {
      eventName: "Lead",
      eventId: UUID_RE.test(eventId) ? eventId : `lead:${inquiry.publicId}`,
      sourceUrl: input.eventSourceUrl,
      user: { email, phone, fullName },
      customData: waitlisted ? { content_name: "waitlist" } : undefined,
    },
    { withRequest: true },
  );

  return { ok: true, waitlisted };
}
