import { THEME_STORAGE_KEY } from "./storage-key";

// Runs synchronously in <head> during HTML parsing, before first paint, so the
// stored theme is applied without a flash. Render it from a Server Component
// (e.g. an inline <script>) so it does not trip React's "script inside a Client
// Component" warning. Keyed off THEME_STORAGE_KEY so it can never drift from the
// provider's storage key.
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;
