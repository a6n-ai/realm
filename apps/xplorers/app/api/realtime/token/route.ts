import { signRealtimeToken } from "@foundry/realtime";
import { authorizeChannel } from "@/lib/realtime/authorize";

// Mirrors the Worker's fail-closed floor on the shared secret.
const MIN_SECRET = 32;

export async function GET(request: Request): Promise<Response> {
  const url = process.env.REALTIME_URL;
  const secret = process.env.REALTIME_SECRET;
  if (!url || !secret || secret.length < MIN_SECRET) return new Response("Not found", { status: 404 });

  const channel = new URL(request.url).searchParams.get("channel");
  if (!channel) return new Response("Missing channel", { status: 400 });

  const auth = await authorizeChannel(channel);
  if (!auth) return new Response("Forbidden", { status: 403 });

  const token = await signRealtimeToken(secret, { channel: auth.channel, userId: auth.userId, role: auth.role });
  return Response.json({ url, token }, { headers: { "Cache-Control": "no-store" } });
}
