import { currentUserId, getFeed, markRead } from "@/lib/notifications/feed";

/** GET: recent feed + unread count for the logged-in user. */
export async function GET(): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return new Response("unauthorized", { status: 401 });
  return Response.json(await getFeed(userId));
}

/** POST { publicIds? }: mark those read, or all unread when omitted. */
export async function POST(req: Request): Promise<Response> {
  const userId = await currentUserId();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { publicIds?: string[] };
  const marked = await markRead(userId, body.publicIds);
  return Response.json({ marked });
}
