/**
 * Resolves on the visitor's first scroll, tap, pointer or key, or `delayMs` after
 * the call once the browser is idle, whichever comes first. Heavy page extras (the
 * live figure, the map) wait for it so they never compete with the first paint.
 */
export function afterFirstInput(delayMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    const events = ["scroll", "wheel", "pointerdown", "touchstart", "keydown"] as const;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      events.forEach((e) => removeEventListener(e, done));
      clearTimeout(timer);
      resolve();
    };
    events.forEach((e) => addEventListener(e, done, { once: true, passive: true }));
    const timer = window.setTimeout(() => ("requestIdleCallback" in window ? requestIdleCallback(done, { timeout: 2000 }) : done()), delayMs);
  });
}
