// Same model as relay (apps/relay/src/components/shell/theme.ts): dark unless the user picked light or system.
export type ThemePref = "dark" | "light" | "system";

export const THEME_KEY = "a6n-theme";

export const isThemePref = (v: string | null): v is ThemePref => v === "dark" || v === "light" || v === "system";

export const resolveTheme = (pref: ThemePref, prefersDark: boolean): "dark" | "light" =>
  pref === "system" ? (prefersDark ? "dark" : "light") : pref;

export const THEME_ORDER: readonly ThemePref[] = ["system", "light", "dark"];

// Arrow-key move inside the segmented control; wraps at both ends.
export const stepTheme = (pref: ThemePref, dir: 1 | -1): ThemePref =>
  THEME_ORDER[(THEME_ORDER.indexOf(pref) + dir + THEME_ORDER.length) % THEME_ORDER.length]!;

// Runs before paint so a dark page never flashes light. Storage errors (private mode) fall back to dark.
export const themeBootScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=p==="light"?false:p==="system"?matchMedia("(prefers-color-scheme: dark)").matches:true;document.documentElement.classList.toggle("dark",d)}catch(e){document.documentElement.classList.add("dark")}})()`;
