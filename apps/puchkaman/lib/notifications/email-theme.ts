import type { EmailThemeOverrides } from "@relay/engine/ui";

// Public palette from app/globals.css: paper page, cream card, green (white text) CTA,
// yellow accent rule. Red is status-only, so it never appears here.
const FONT = "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const emailTheme: EmailThemeOverrides = {
  body: { backgroundColor: "#FFFBF0", fontFamily: FONT, color: "#16140D" },
  container: { backgroundColor: "#FFFFFF", borderRadius: "16px", padding: "32px", border: "2px solid #16140D" },
  h1: { color: "#16140D", fontSize: "28px", lineHeight: "34px", fontWeight: 800 },
  h2: { color: "#16140D", fontSize: "22px", lineHeight: "28px", fontWeight: 800 },
  paragraph: { color: "#16140D", fontSize: "16px", lineHeight: "24px" },
  link: { color: "#1F7A34" },
  button: { backgroundColor: "#1F7A34", color: "#FFFFFF", borderRadius: "9999px", padding: "14px 26px", fontWeight: 700 },
  hr: { borderColor: "#FCD807" },
};
