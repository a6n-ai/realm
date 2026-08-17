import { z } from "zod";

export function contactFormSchema() {
  return z.object({
    fullName: z.string().trim().min(1, "Name is required"),
    phone: z.string().min(1, "Phone is required"),
    // Required, not optional: the inquiry this form creates needs an email —
    // it is the customer's login path, and InquiriesService.create rejects
    // without one. An optional field here silently lost the lead at submit.
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
    postalCode: z.string().optional(),
    message: z.string().optional(),
    company: z.string().optional(),
  });
}
export type ContactFormValues = z.infer<ReturnType<typeof contactFormSchema>>;
