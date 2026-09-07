import { z } from "zod";
import { CATERING_REGION_LABELS } from "@/lib/links";

// Mirrors the client-side CForm shape in app/(marketing)/catering/catering-view.tsx —
// server-side validation for the public (unauthenticated) inquiry endpoint.
export const cateringInquirySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(7, "Enter a valid phone"),
  email: z.string().trim().email("Enter a valid email"),
  date: z.string().trim().min(1, "Event date is required"),
  // Constrained rather than free text: this value routes the notification, so
  // an unrecognised region would silently land in the untriaged pile.
  region: z.enum(CATERING_REGION_LABELS as [string, ...string[]], { message: "Choose a service area" }),
  location: z.string().trim().min(1, "Event location is required"),
  guests: z.string().trim().min(1, "Number of guests is required"),
  type: z.string().trim().min(1, "Event type is required"),
  allergies: z.string().trim().optional(),
  message: z.string().trim().optional(),
});

export type CateringInquiry = z.infer<typeof cateringInquirySchema>;
