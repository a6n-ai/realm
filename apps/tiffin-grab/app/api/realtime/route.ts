import { authorizeChannel } from "@/lib/realtime/authorize";
import { ensureNotifyBridge } from "@/lib/realtime/notify-bridge";
import { sseResponse } from "@foundry/realtime/server";

export async function GET(request: Request): Promise<Response> {
  const channel = new URL(request.url).searchParams.get("channel");
  if (!channel) return new Response("Missing channel", { status: 400 });

  const auth = await authorizeChannel(channel);
  if (!auth) return new Response("Forbidden", { status: 403 });

  if (channel.startsWith("notify:")) await ensureNotifyBridge().catch(() => {});

  return sseResponse({ channel: auth.channel, userId: auth.userId, role: auth.role });
}
