import localFont from "next/font/local";

// Same files as `geist/font/*`, redeclared with preload: false. The package's
// exports preload every face (importing GeistPixelCircle pulled in all five
// pixel fonts), so the public home page preloaded ~300 KB of dashboard-only
// fonts that raced the render-blocking CSS. Sans + pixel are scoped to
// .crm-app, and mono is incidental; they still load on first use.
// next/font options must be literals, hence the repeated fallback lists.

export const geistSans = localFont({
  src: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  preload: false,
});

export const geistMono = localFont({
  src: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Roboto Mono", "Menlo", "Monaco", "Liberation Mono", "DejaVu Sans Mono", "Courier New", "monospace"],
  preload: false,
});

export const geistPixelCircle = localFont({
  src: "../node_modules/geist/dist/fonts/geist-pixel/GeistPixel-Circle.woff2",
  variable: "--font-geist-pixel-circle",
  weight: "500",
  adjustFontFallback: false,
  fallback: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Roboto Mono", "Menlo", "Monaco", "Liberation Mono", "DejaVu Sans Mono", "Courier New", "monospace"],
  preload: false,
});
