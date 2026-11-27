// Same model as relay (apps/relay/src/components/shell/theme.ts): dark unless the user picked light or system.
export type ThemePref = "dark" | "light" | "system";

export const THEME_KEY = "a6n-theme";

export const isThemePref = (v: string | null): v is ThemePref => v === "dark" || v === "light" || v === "system";

export const resolveTheme = (pref: ThemePref, prefersDark: boolean): "dark" | "light" =>
  pref === "system" ? (prefersDark ? "dark" : "light") : pref;

// Runs before paint so a dark page never flashes light. Storage errors (private mode) fall back to dark.
export const themeBootScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=p==="light"?false:p==="system"?matchMedia("(prefers-color-scheme: dark)").matches:true;document.documentElement.classList.toggle("dark",d)}catch(e){document.documentElement.classList.add("dark")}})()`;
