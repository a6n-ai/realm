/** Avatar letters: the first letter of the first two words, letters only. */
export function initials(name: string): string {
  return name.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#";
}
