// The cutoff is shown once in the header from live settings, never per trip: a trip's
// stored cutoffAt is a snapshot and would show a stale hour after an admin changes it.
// Own module so the shells can import it without pulling in the deliveries view model.
export const cutoffTime = (cutoffHour: number) => `${cutoffHour % 12 || 12}:00 ${cutoffHour < 12 ? "am" : "pm"}`;
export const cutoffNote = (cutoffHour: number) => `Changes close at ${cutoffTime(cutoffHour)} the day before each delivery`;
