export type DayType = "weekday" | "weekend";
export type PriceCell = { weekday?: number; weekend?: number };
/** Keys: `len:<minutes>` (e.g. "len:90"), `opt:<optionKey>`, or `ext` (extension step price). */
export type PriceTable = Record<string, PriceCell>;
export type NamedOption = { key: string; label: string; lengthMinutes: number; adultsIncluded: number };
export type ClassPricing = {
  mode: "length" | "options";
  defaultLengthMinutes: number;
  options: NamedOption[];
  /** Per child per step. */
  extension: { stepMinutes: 30 | 60; price: PriceCell } | null;
  /** extraPrice null = extra adults not allowed. */
  adults: { free: number; extraPrice: PriceCell | null };
};
export type BookingChoice = { kind: "length"; minutes: number } | { kind: "option"; key: string };
export type Quote = {
  endsAt: Date;
  perChild: number;
  extensionPerChild: number;
  extraAdults: number;
  adultCharge: number;
  subtotal: number;
};
