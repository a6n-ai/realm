import { authorizeChannel } from "@/lib/realtime/authorize";
import { publishLive } from "@/lib/realtime/publish-inbox";

export async function POST(request: Request): Promise<Response> {
  const { channel, typing } = (await request.json()) as { channel?: string; typing?: boolean };
  if (!channel) return new Response("Missing channel", { status: 400 });

  const auth = await authorizeChannel(channel);
  if (!auth) return new Response("Forbidden", { status: 403 });

  publishLive(auth.channel, { type: "typing", userId: auth.userId, role: auth.role, typing: Boolean(typing) });
  return new Response(null, { status: 204 });
}
