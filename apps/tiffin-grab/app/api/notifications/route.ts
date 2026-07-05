import { handler, problem } from "@realm/routes";
import { currentUserId, getFeed, markRead } from "@/lib/notifications/feed";

/** GET: recent feed + unread count for the logged-in user. */
export const GET = handler(async (): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  return Response.json(await getFeed(userId));
});

/** POST { publicIds? }: mark those read, or all unread when omitted. */
export const POST = handler(async (req: Request): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  const body = (await req.json().catch(() => ({}))) as { publicIds?: string[] };
  const marked = await markRead(userId, body.publicIds);
  return Response.json({ marked });
});
