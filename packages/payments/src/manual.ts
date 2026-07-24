import type { PaymentMethodConfig } from "./config";
import type { InitiateInput, InitiateResult, PaymentProvider } from "./provider";

// Manual rail (e-Transfer/cash): initiate just echoes the admin-configured instructions +
// payee, using the order's public id as the human-friendly reference the customer includes.
export class ManualProvider implements PaymentProvider {
  readonly kind = "manual" as const;
  constructor(readonly id: string) {}

  initiate(input: InitiateInput): InitiateResult {
    return {
      kind: "manual_instructions",
      instructions: input.method.instructions ?? "",
      payeeHandle: input.method.payeeHandle ?? "",
      reference: input.orderRef,
    };
  }
}

export function providerFor(method: PaymentMethodConfig): PaymentProvider {
  switch (method.kind) {
    case "manual":
      return new ManualProvider(method.id);
    case "online":
      throw new Error("Online payment providers are not implemented yet");
    default: {
      const _exhaustive: never = method.kind;
      throw new Error(`Unknown payment method kind: ${String(_exhaustive)}`);
    }
  }
}
