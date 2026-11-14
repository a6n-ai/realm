import { ThinkingOrb } from "@/components/thinking-orb";

// The customer app's loading screen: a small thinking orb (pure CSS, components/thinking-orb.tsx) on the
// page's own background. It sits in each /me route's loading.tsx, so it stays until the page has
// streamed in; OrbNavOverlay covers the moment before that boundary appears.

/** Full-height orb, for a route's loading.tsx. */
export function OrbLoading() {
  return (
    <div className="tg-orbload" role="status" aria-label="Loading">
      <ThinkingOrb size={72} small />
    </div>
  );
}

/** Covers an in-app navigation still waiting on the server. Always rendered, hidden; NavPending's
 *  html[data-nav="orb"] shows it after 250 ms (globals.css), so a quick navigation never flashes it. */
export function OrbNavOverlay() {
  return (
    <div className="tg-orbload tg-orbload--overlay" aria-hidden>
      <ThinkingOrb size={72} small />
    </div>
  );
}
