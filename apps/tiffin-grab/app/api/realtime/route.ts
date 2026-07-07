import { authorizeChannel } from "@/lib/realtime/authorize";
import { sseResponse } from "@realm/realtime/server";

export async function GET(request: Request): Promise<Response> {
  const channel = new URL(request.url).searchParams.get("channel");
  if (!channel) return new Response("Missing channel", { status: 400 });

  const auth = await authorizeChannel(channel);
  if (!auth) return new Response("Forbidden", { status: 403 });

  return sseResponse({ channel, userId: auth.userId, role: auth.role });
}
