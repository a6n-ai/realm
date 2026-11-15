"use server";

import { publicWriteRefusal } from "@/lib/auth/public-write-guard";
import { recordWebsiteInquiry, type ContactInput } from "./inquiry-intake";

export type { ContactInput };

// A refusal comes back as `{ error }`: a thrown message is redacted in production.
export async function createWebsiteInquiry(
  input: ContactInput,
  opts?: { detailsSource?: "website" | "waitlist" },
): Promise<{ ok: true; waitlisted: boolean } | { error: string }> {
  // Honeypot bots skip the check too: a filled `company` field is accepted silently, with no write.
  if (!input.company?.trim()) {
    const refusal = await publicWriteRefusal("inquiry", input.captchaToken, 20);
    if (refusal) return { error: refusal };
  }
  return recordWebsiteInquiry(input, opts);
}
