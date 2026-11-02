import { signRealtimeToken } from "@foundry/realtime";
import { authorizeChannel } from "@/lib/realtime/authorize";
import { realtimeConfig } from "@/lib/realtime/config";

export async function GET(request: Request): Promise<Response> {
  const cfg = realtimeConfig();
  if (!cfg) return new Response("Not found", { status: 404 });

  const channel = new URL(request.url).searchParams.get("channel");
  if (!channel) return new Response("Missing channel", { status: 400 });

  const auth = await authorizeChannel(channel);
  if (!auth) return new Response("Forbidden", { status: 403 });

  const token = await signRealtimeToken(cfg.secret, { channel: auth.channel, userId: auth.userId, role: auth.role });
  return Response.json({ url: cfg.url, token }, { headers: { "Cache-Control": "no-store" } });
}
