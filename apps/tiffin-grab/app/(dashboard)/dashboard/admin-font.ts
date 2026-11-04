import localFont from "next/font/local";

// Own module, not app/fonts.ts: next/font preloads per importing module, so living
// beside the root layout's fonts made every public page preload it too.
// The same Geist Sans file, preloaded. Imported only by the dashboard layout, so
// next/font injects the preload on /dashboard routes alone: without it the
// admin shell painted in the fallback face and swapped to Geist a beat later.
// Same file, same hashed URL, so the browser downloads it once.
export const geistSansAdmin = localFont({
  src: "../../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  preload: true,
});
