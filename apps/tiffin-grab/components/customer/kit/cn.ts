export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export const FONT = "font-[family-name:var(--font-poppins),system-ui,sans-serif]";
export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary,#F06B1A)]";
export const SPRING = "ease-[var(--ease-spring,cubic-bezier(.34,1.56,.64,1))]";
