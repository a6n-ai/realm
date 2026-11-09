export const QUICK_ADD_MAX = 200;

/** Rush-time paste: one number per line or comma-separated. Duplicates (by digits) count once. */
export function parsePastedPhones(text: string): { phones: string[]; tooMany: boolean } {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const piece of text.split(/[\n,;]+/)) {
    const p = piece.trim();
    const key = p.replace(/\D/g, "");
    if (!p || seen.has(key)) continue;
    seen.add(key);
    phones.push(p);
  }
  return { phones, tooMany: phones.length > QUICK_ADD_MAX };
}
