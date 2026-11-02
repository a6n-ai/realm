// Warm-up target (GET it before a demo to load the Worker). Deliberately touches
// nothing: a DB query here would keep Neon awake around the clock.
export function GET(): Response {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
