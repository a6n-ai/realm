import { z } from "zod";

export const inquiryFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
  sourceKey: z.string().min(1),
  notes: z.string().optional(),
});
export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
