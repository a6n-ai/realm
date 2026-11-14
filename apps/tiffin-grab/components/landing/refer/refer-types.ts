export type ReferExtras = {
  /** Lowest live per-tiffin rate, formatted ("$9.99"); null when no plan is orderable. */
  fromRate: string | null;
  /** One day of the published week, tier by tier; null when no week is published. */
  day: { label: string; today: boolean; tiers: { row: string; dishes: string[] }[] } | null;
  /** "10% off with WELCOME10" from the running promotion; null when none runs. */
  promo: string | null;
};

export const NO_EXTRAS: ReferExtras = { fromRate: null, day: null, promo: null };
