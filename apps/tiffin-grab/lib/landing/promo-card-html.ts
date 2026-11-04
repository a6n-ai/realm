// Client-safe: the promotion form imports it to tell an untouched starter from staff edits.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The built-in coupon card text as editable HTML, so staff start from what the landing page shows
 * today. Saved promotion HTML replaces the badge, title and blurb; the button and code stub stay.
 * Inline styles only: it renders in a sandboxed iframe that the site's CSS does not reach.
 */
export function promoCardHtml({ badge, title, blurb }: { badge: string | null; title: string; blurb: string | null }): string {
  const lines = [
    `<!doctype html>`,
    `<html>`,
    // Poppins comes from the frame wrapper (PromoHtml), self-hosted.
    // Transparent with no padding: the card behind it already draws the gradient and spacing.
    // vw here is the frame's width, so 20vw tracks the site's clamp(48px, 6.5vw, 88px) headline.
    `  <body style="margin: 0; background: transparent; font-family: Poppins, Arial, sans-serif; color: #2e1200">`,
    `    <div style="display: flex; flex-direction: column; gap: 12px">`,
    `      <strong style="font-size: clamp(48px, 20vw, 88px); line-height: 0.9; font-weight: 800; letter-spacing: -0.05em; text-transform: uppercase; overflow-wrap: anywhere">${esc(badge || title)}</strong>`,
  ];
  if (badge) lines.push(`      <span style="font-size: 18px; font-weight: 700">${esc(title)}</span>`);
  if (blurb) lines.push(`      <p style="margin: 0; max-width: 40ch; font-size: 16px; line-height: 1.5; opacity: 0.8">${esc(blurb)}</p>`);
  lines.push(`    </div>`, `  </body>`, `</html>`);
  return lines.join("\n");
}
