// Client-safe (no next/headers): the layout reads the cookie and the sidebar writes it.
export const SIDEBAR_WIDTH_COOKIE = "tg_sidebar_width";
export const SIDEBAR_WIDTH_DEFAULT = 255;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 320;

export const clampSidebarWidth = (w: number) => Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, w));

// Junk must fall back to the default, not clamp to the minimum.
export function parseSidebarWidth(raw: string | null | undefined): number {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_WIDTH_DEFAULT;
}
