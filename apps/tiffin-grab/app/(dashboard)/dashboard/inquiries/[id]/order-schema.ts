import { z } from "zod";

export const orderFormSchema = z.object({
  planKey: z.string().min(1),
  mealSizeId: z.string().min(1),
  frequencyKey: z.enum(["5_day", "mwf"]),
  persons: z.coerce.number().int().min(1).max(5),
  mealSlots: z.array(z.string()).min(1),
  includeSaturday: z.boolean(),
  includeSunday: z.boolean(),
  durationWeeks: z.coerce.number().int().min(1),
  startDate: z.string().min(1, "Start date is required"),
  email: z.string().optional(),
  addressLine: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  postalCode: z.string().min(1, "Postal code is required"),
});
export type OrderFormInput = z.input<typeof orderFormSchema>;
export type OrderFormValues = z.infer<typeof orderFormSchema>;
