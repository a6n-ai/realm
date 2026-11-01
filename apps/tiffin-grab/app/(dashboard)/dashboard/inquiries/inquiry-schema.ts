import { emailSchema } from "@foundry/commons";
import { z } from "zod";

export const inquiryFormSchema = z.object({
  fullName: z.string().trim().optional(),
  // Lead capture takes whatever number they give — deliverability is judged by
  // postal/zone later, not by phone shape.
  phone: z.string().trim().optional(),
  email: emailSchema.optional().or(z.literal("")),
  sourceKey: z.string().min(1),
  subSourceKey: z.string().optional(),
  planInterest: z.string().optional(),
  mealSizeInterest: z.string().optional(),
  personsInterest: z.coerce.number().int().min(1).max(20).optional(),
  frequencyKeyInterest: z.string().optional(),
  eatingDaysInterest: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).optional(),
  postalCode: z.string().optional(),
  preferredStart: z.string().optional(),
  quotedPrice: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
  nextFollowUpAt: z.number().optional(),
}).superRefine((v, ctx) => {
  if (!v.fullName && !v.phone) {
    ctx.addIssue({ code: "custom", path: ["fullName"], message: "Enter a name or phone number" });
  }
});
export type InquiryFormInput = z.input<typeof inquiryFormSchema>;
export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;
