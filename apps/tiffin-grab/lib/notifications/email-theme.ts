import type { EmailThemeOverrides } from "@relay/engine/ui";

// Same tokens as emails/transactional.tsx (DESIGN.md): cream page, white card, saffron pill.
const FONT = "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const emailTheme: EmailThemeOverrides = {
  body: { backgroundColor: "#FBF4E7", fontFamily: FONT, color: "#241F1B" },
  container: { backgroundColor: "#FFFFFF", borderRadius: "24px", padding: "32px", border: "1px solid #E3DFD1" },
  h1: { color: "#241F1B", fontSize: "28px", lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.03em" },
  h2: { color: "#241F1B", fontSize: "22px", lineHeight: "28px", fontWeight: 700 },
  paragraph: { color: "#241F1B", fontSize: "16px", lineHeight: "24px" },
  link: { color: "#F06B1A" },
  button: { backgroundColor: "#F06B1A", color: "#FFFFFF", borderRadius: "9999px", padding: "15px 28px", fontWeight: 600 },
};
