import { z } from "zod";
import { emailSchema } from "@realm/commons";

/** A single email participant. `name` is optional display name. */
export const emailAddressSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).optional(),
});
export type EmailAddress = z.infer<typeof emailAddressSchema>;

/**
 * A provider-agnostic, already-rendered email. Template rendering happens
 * upstream (templates layer) — a provider only transports what it's given.
 */
export const emailMessageSchema = z
  .object({
    to: z.union([emailAddressSchema, z.array(emailAddressSchema).min(1)]),
    cc: z.array(emailAddressSchema).optional(),
    bcc: z.array(emailAddressSchema).optional(),
    /** Falls back to the provider's configured default sender when omitted. */
    from: emailAddressSchema.optional(),
    replyTo: emailAddressSchema.optional(),
    subject: z.string().trim().min(1, "Email subject is required"),
    html: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
  })
  .refine((m) => m.html || m.text, {
    message: "Email must have an html or text body",
    path: ["html"],
  });
export type EmailMessage = z.input<typeof emailMessageSchema>;
/** Validated + normalized message a provider actually delivers. */
export type PreparedEmail = z.output<typeof emailMessageSchema> & { from: EmailAddress };

export interface SendResult {
  /** Provider-side id (e.g. SES MessageId) for tracing / bounce correlation. */
  providerMessageId: string;
  provider: string;
}
