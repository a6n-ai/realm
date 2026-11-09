import type { PluginLogo } from "@foundry/commons/plugin";
import type { Tone } from "@/lib/plugins";

/** Icon tile + one-line "how it settles" per payment provider. Keys are provider ids. */
export const PROVIDER_DISPLAY: Record<string, { tone: Tone; logo?: PluginLogo; kind: "Manual" | "Online"; settles: string }> = {
  cash: { tone: "green", kind: "Manual", settles: "Collected at the door" },
  etransfer: { tone: "amber", kind: "Manual", settles: "Staff verifies the transfer" },
  stripe: { tone: "indigo", kind: "Online", settles: "Settles automatically" },
};

export const providerDisplay = (id: string) =>
  PROVIDER_DISPLAY[id] ?? { tone: "gray" as const, kind: "Manual" as const, settles: "Staff verifies the claim" };

export function providerHref(id: string): string {
  return id === "stripe" ? "/dashboard/settings/payments/stripe" : `/dashboard/settings/payments/${id}`;
}
