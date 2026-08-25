// A fixed locale (never the runtime default) keeps this identical on the server
// during SSR and in the browser after hydration — omitting it lets Intl fall
// back to each side's own locale, which can disagree on field order and trips
// a hydration mismatch. timeZone is required for the same reason: the caller's
// app-settings timezone, not whichever zone the process happens to run in.
export function formatConsentDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(ms);
}
