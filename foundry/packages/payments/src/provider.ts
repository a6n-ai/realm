import type { PaymentMethodConfig } from "./config";

export type InitiateResult =
  | { kind: "manual_instructions"; instructions: string; payeeHandle: string; reference: string }
  | { kind: "redirect"; url: string }
  | { kind: "client_secret"; clientSecret: string };

export type InitiateInput = { orderRef: string; amount: number; method: PaymentMethodConfig };

export interface PaymentProvider {
  id: string;
  kind: "manual" | "online";
  initiate(input: InitiateInput): InitiateResult;
}
