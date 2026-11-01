import { formatPhone } from "@foundry/commons";

export function displayName(i: { fullName: string | null; phone: string | null }): string {
  return i.fullName?.trim() || formatPhone(i.phone) || "Unnamed lead";
}
