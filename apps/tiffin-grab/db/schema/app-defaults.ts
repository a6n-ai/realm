// Single source for the app row's column defaults, the settings service fallback and the seeds.
export const APP_DEFAULTS = {
  timezone: "America/Toronto",
  cutoffHour: 18,
  currency: "INR",
  minTiffinsPerWeek: 3,
  maxTiffinsPerWeek: 7,
  maxDiscountPct: 25,
} as const;
