import { ValidationError } from "@tiffin/commons";

export function validateOrderSlots(
  planType: "tiffin" | "healthy",
  offeredSlots: string[],
  chosen: string[],
): void {
  if (chosen.length === 0) throw new ValidationError("At least one meal slot is required");
  const offered = new Set(offeredSlots);
  for (const s of chosen) {
    if (!offered.has(s)) throw new ValidationError(`Slot "${s}" is not offered by this plan`);
  }
  if (planType === "tiffin" && chosen.length !== 1) {
    throw new ValidationError("A tiffin plan allows exactly one meal slot");
  }
}
