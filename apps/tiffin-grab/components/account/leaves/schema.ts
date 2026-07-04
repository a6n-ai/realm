import { z } from "zod";

export const accountFormSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  email: z.string().optional(),
});
export type AccountFormValues = z.infer<typeof accountFormSchema>;
