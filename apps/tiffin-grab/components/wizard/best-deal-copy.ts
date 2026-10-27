// Hand-written wording for the Best deal card, one entry per wizard page. Edit the text here when
// the offer changes; only the label and percentage are filled in (from the discounts table / catalog) so it never drifts.
export const BEST_DEAL_COPY = {
  bundle: {
    title: "Deal on now",
    body: (label: string, pct: number) => `${label} is ${pct}% off.`,
    appliedTitle: "Applied",
    appliedBody: (label: string, pct: number) => `${label} · ${pct}% off.`,
  },
  frequency: {
    title: "Fewer deliveries, lower price",
    body: (label: string, pct: number) => `Select ${label} to save ${pct}% on every tiffin.`,
    appliedTitle: "Applied",
    appliedBody: (label: string, pct: number) => `You're getting ${label} — saving ${pct}% on every tiffin.`,
  },
  duration: {
    title: "Longer plan, lower price",
    body: (label: string, pct: number) => `Select ${label} to save ${pct}% on every tiffin.`,
    appliedTitle: "Applied",
    appliedBody: (label: string, pct: number) => `${label} · saving ${pct}% on every tiffin.`,
  },
} as const;
