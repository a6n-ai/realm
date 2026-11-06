export const toCents = (d: number | string): number => Math.round(Number(d) * 100);
export const fromCents = (c: number): string => (c / 100).toFixed(2);

/** part/whole as a percent with one decimal; callers guard whole > 0. */
export const ratePct = (part: number, whole: number): number => Math.round((part / whole) * 1000) / 10;
