// The human-readable half of a meal_pick activity row. Pure and separate from
// selections.service so it can be tested without a database.

export function mealPickNote(input: {
  deliveryDateIso: string;
  categoryLabel: string;
  personIndex: number;
  persons: number;
  from: string | null;
  to: string;
}): string {
  const { deliveryDateIso, categoryLabel, personIndex, persons, from, to } = input;
  // A single-person order has no meaningful person axis — saying "person 1 of 1" is noise.
  const who = persons > 1 ? ` (person ${personIndex} of ${persons})` : "";
  const change = from ? `${from} → ${to}` : to;
  return `${deliveryDateIso} · ${categoryLabel}${who}: ${change}`;
}
