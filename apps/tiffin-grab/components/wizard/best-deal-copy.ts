// Hand-written wording for the Best deal card, one entry per wizard page. Edit the text here when
// the offer changes; only the percentage is filled in (from the discounts table) so it never drifts.
export const BEST_DEAL_COPY = {
  frequency: {
    title: "Tip for your delivery",
    body: (label: string, pct: number) => `Select ${label} to save ${pct}% on every tiffin.`,
  },
  duration: {
    title: "Tip for your plan length",
    body: (label: string, pct: number) => `Select ${label} to save ${pct}% on every tiffin.`,
  },
} as const;
