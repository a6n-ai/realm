import { handleMcp } from "@/lib/public-api/mcp";
import { loadPublic } from "@/lib/public-api/load";

// MCP over Streamable HTTP, stateless and read-only (lib/public-api/mcp.ts). Open to any origin: no cookies,
// no auth and only public data, so a DNS-rebinding or cross-site caller learns nothing the site doesn't show.
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });

// A JSON-RPC message here is well under 1 KB; refuse anything big before parsing it.
const MAX_BODY = 64 * 1024;

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
  let msg: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
    msg = JSON.parse(text);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(msg)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batches are not supported" } }, 400);
  const out = await handleMcp(msg as Parameters<typeof handleMcp>[0], loadPublic);
  return out ? json(out) : new Response(null, { status: 202, headers: CORS });
}

// No server-to-client stream and no sessions: GET and DELETE are 405, as the transport allows.
const notAllowed = () => new Response(null, { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
