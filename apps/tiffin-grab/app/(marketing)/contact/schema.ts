import { z } from "zod";

export function contactFormSchema() {
  return z.object({
    fullName: z.string().trim().min(1, "Name is required"),
    phone: z.string().min(1, "Phone is required"),
    email: z.string().optional(),
    postalCode: z.string().optional(),
    message: z.string().optional(),
    company: z.string().optional(),
  });
}
export type ContactFormValues = z.infer<ReturnType<typeof contactFormSchema>>;
