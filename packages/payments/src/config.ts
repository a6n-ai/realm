import { z } from "zod";

export const taxLineSchema = z.object({
  name: z.string().min(1),
  ratePct: z.number().min(0).max(100),
});
export type TaxLine = z.infer<typeof taxLineSchema>;

export const paymentMethodConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["manual", "online"]),
  enabled: z.boolean().default(false),
  label: z.string().min(1),
  instructions: z.string().optional(),
  payeeHandle: z.string().optional(),
  requireProof: z.boolean().optional(),
  taxes: z.array(taxLineSchema).default([]),
});
export type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;

export const paymentConfigSchema = z.object({
  methods: z.array(paymentMethodConfigSchema).default([]),
  defaultMethodId: z.string().optional(),
});
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = { methods: [] };

// NULL/garbage config → simulated mode (no methods). Never throws on read.
export function parsePaymentConfig(raw: unknown): PaymentConfig {
  const parsed = paymentConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_PAYMENT_CONFIG;
}

export function enabledMethods(cfg: PaymentConfig): PaymentMethodConfig[] {
  return cfg.methods.filter((m) => m.enabled);
}

export function findMethod(cfg: PaymentConfig, id: string): PaymentMethodConfig | undefined {
  return cfg.methods.find((m) => m.id === id);
}
