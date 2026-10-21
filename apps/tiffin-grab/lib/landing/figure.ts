// First-paint figure, rasterized from the static SVG by scripts/tiffin-figure/raster.mjs.
export const FIGURE_WIDTHS = [480, 720, 960, 1440] as const;
export const FIGURE_RASTER = FIGURE_WIDTHS.map((w) => `/landing/tiffin-figure-${w}.webp`);
export const FIGURE_SRCSET = FIGURE_WIDTHS.map((w, i) => `${FIGURE_RASTER[i]} ${w}w`).join(", ");
// Phones cap the figure at 27svh tall, about 260px wide; desktop draws it at most 680px.
export const FIGURE_SIZES = "(max-width: 900px) 260px, 680px";
