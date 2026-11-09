/** A delivery day locks the instant its cutoff arrives: at now === cutoffAt it is already closed. */
export const isCutoffPassed = (cutoffAt: number, now: number): boolean => now >= cutoffAt;
