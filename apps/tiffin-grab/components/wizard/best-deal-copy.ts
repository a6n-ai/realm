// Hand-written wording for the Best deal card, one entry per wizard page. Edit the text here when
// the offer changes; only the label and percentage are filled in (from the discounts table / catalog) so it never drifts.
export const BEST_DEAL_COPY = {
  bundle: {
    title: "Deal on now",
    body: (label: string, pct: number) => `Select ${label}: ${pct}% off right now.`,
    appliedTitle: "Applied",
    appliedBody: (label: string, pct: number) => `You've picked ${label} — ${pct}% off right now.`,
  },
  frequency: {
    title: "Tip for your delivery",
    body: (label: string, pct: number) => `Select ${label} to save ${pct}% on every tiffin.`,
    appliedTitle: "Applied",
    appliedBody: (label: string, pct: number) => `You're getting ${label} — saving ${pct}% on every tiffin.`,
  },
  duration: {
    title: "Tip for your plan length",
    body: (label: string, pct: number) => `Select ${label} to save ${pct}% on every tiffin.`,
    appliedTitle: "Applied",
    appliedBody: (label: string, pct: number) => `You've picked ${label} — saving ${pct}% on every tiffin.`,
  },
} as const;
