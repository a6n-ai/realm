import type { Appearance } from "@stripe/stripe-js";

// Mirrors DESIGN.md / app/globals.css. Stripe's iframe can't read CSS variables, so values are literal.
export const CUSTOMER_TOKENS = {
  fontFamily: "Poppins, system-ui, sans-serif",
  radiusInput: "16px",
  light: { primary: "#F06B1A", background: "#FFFFFF", text: "#241F1B", muted: "#6E6558", hairline: "#E3DFD1", danger: "#BE123C", wash: "#FBE3D2" },
  dark: { primary: "#FF9843", background: "#1B2921", text: "#F3EFE4", muted: "#A9AFA3", hairline: "rgba(255, 255, 255, 0.1)", danger: "#FDA4AF", wash: "#3A2A1C" },
} as const;

export function stripeAppearance(scheme: "light" | "dark"): Appearance {
  const t = CUSTOMER_TOKENS[scheme];
  return {
    theme: scheme === "dark" ? "night" : "stripe",
    variables: {
      fontFamily: CUSTOMER_TOKENS.fontFamily,
      colorPrimary: t.primary,
      colorBackground: t.background,
      colorText: t.text,
      colorTextSecondary: t.muted,
      colorDanger: t.danger,
      borderRadius: CUSTOMER_TOKENS.radiusInput,
      spacingUnit: "4px",
    },
    rules: {
      ".Input": { border: `1px solid ${t.hairline}`, boxShadow: "none", padding: "14px" },
      ".Input:focus": { border: `1px solid ${t.primary}`, boxShadow: `0 0 0 3px ${t.wash}`, outline: "none" },
      ".Tab": { border: `1px solid ${t.hairline}`, boxShadow: "none" },
      ".Tab--selected": { border: `1px solid ${t.primary}`, boxShadow: `0 0 0 3px ${t.wash}` },
      ".Label": { fontSize: "13px", fontWeight: "600", color: t.muted },
    },
  };
}
