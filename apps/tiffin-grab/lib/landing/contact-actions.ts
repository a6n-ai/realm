"use server";

import { guardPublicWrite } from "@/lib/auth/public-write-guard";
import { recordWebsiteInquiry, type ContactInput } from "./inquiry-intake";

export type { ContactInput };

export async function createWebsiteInquiry(input: ContactInput, opts?: { detailsSource?: "website" | "waitlist" }): Promise<{ ok: true; waitlisted: boolean }> {
  // Honeypot bots skip the check too: a filled `company` field is accepted silently, with no write.
  if (!input.company?.trim()) await guardPublicWrite("inquiry", input.captchaToken, 20);
  return recordWebsiteInquiry(input, opts);
}
