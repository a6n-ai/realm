// Shared palette every illustration in this library draws from — matches the app's brand
// tokens exactly (app/globals.css) rather than re-deriving colors, so the icon set stays in
// sync if the brand palette ever moves. Kept as plain hex (not CSS var references) because
// these render as static SVG fills, not themed DOM elements — badge backgrounds still use
// var(--warn) etc. where they need to react to dark mode; the illustrations themselves are
// small enough that a fixed light-mode-tuned palette reads fine on both surfaces.
export const ILLUSTRATION_COLORS = {
  green: "#105030",
  greenTint: "#DCEBE1",
  orange: "#F58220",
  orangeTint: "#FBE3D2",
  cream: "#FBF4E7",
  neutral: "#6E6558",
  neutralTint: "#E3DFD1",
} as const;
