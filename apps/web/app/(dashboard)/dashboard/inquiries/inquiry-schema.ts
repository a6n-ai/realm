import { z } from "zod";

export const inquiryFormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
  sourceKey: z.string().min(1),
  subSourceKey: z.string().optional(),
  planInterest: z.string().optional(),
  mealSizeInterest: z.string().optional(),
  personsInterest: z.coerce.number().int().min(1).max(20).optional(),
  postalCode: z.string().optional(),
  preferredStart: z.string().optional(),
  quotedPrice: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});
export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
