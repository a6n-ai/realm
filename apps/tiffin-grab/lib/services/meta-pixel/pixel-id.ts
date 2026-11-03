/** Digits only: the ID is interpolated into the browser bootstrap script. */
export const PIXEL_ID_RE = /^\d{5,20}$/;
export const TEST_CODE_RE = /^[A-Za-z0-9]{3,40}$/;

/**
 * Copying from Events Manager can carry invisible marks (zero-width, LTR/RTL) or a label like
 * "Pixel ID: 1234…". Drop non-digit junk, keep spaces so a broken paste like "123 456" stays
 * two short runs, then keep the one long digit run.
 */
export function normalizePixelId(raw: string): string | null {
  const cleaned = raw.normalize("NFKC").replace(/[^\d\s]/g, " ");
  const runs = cleaned.match(/\d{5,20}/g) ?? [];
  return runs.length === 1 && PIXEL_ID_RE.test(runs[0]!) ? runs[0]! : null;
}
