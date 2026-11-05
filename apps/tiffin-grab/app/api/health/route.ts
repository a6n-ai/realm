// Keep-warm / uptime probe: must stay DB-free and import-light so a ping does not
// burn Hyperdrive or boot the Next data layer. Public on purpose (proxy PUBLIC_API).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
