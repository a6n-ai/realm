// First and last word's initials, or the first two letters of a one-word name.
export function initials(name?: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const two = words.length > 1 ? words[0]![0]! + words.at(-1)![0]! : (words[0] ?? "").slice(0, 2);
  return two.toUpperCase() || "?";
}
