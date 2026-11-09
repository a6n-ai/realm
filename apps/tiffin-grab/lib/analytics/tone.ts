/** `c1`..`c5` pin a part to one categorical slot so colour follows the entity, not its position. */
export type Tone = "success" | "warning" | "destructive" | "muted" | "chart" | "c1" | "c2" | "c3" | "c4" | "c5";
/** Pins `key` to the slot of its position in a fixed `order`, so it keeps one colour across charts and ranges; unknown or 6th+ keys are muted. */
export function slotTone(key: string, order: readonly string[]): Tone {
  const i = order.indexOf(key);
  return i >= 0 && i < 5 ? (`c${i + 1}` as Tone) : "muted";
}
