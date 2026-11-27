export type ComboKeyResult = { active: number; open: boolean; select: boolean };

// Pure keyboard rules for the company combobox (no DOM test env in this app).
export function comboKey(key: string, active: number, count: number, open: boolean): ComboKeyResult | null {
  if (key === "Escape") return { active, open: false, select: false };
  if (key === "ArrowDown" || key === "ArrowUp") {
    if (!count) return null;
    const next = key === "ArrowDown" ? active + 1 : active < 0 ? count - 1 : active - 1;
    return { active: (next + count) % count, open: true, select: false };
  }
  if (key === "Enter" && open && active >= 0 && active < count) return { active, open: false, select: true };
  return null;
}
