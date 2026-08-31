import { handler, problem } from "@foundry/routes";
import { currentUserId, getFeed, markRead } from "@/lib/notifications/feed";

export const GET = handler(async (): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  return Response.json(await getFeed(userId));
});

export const POST = handler(async (req: Request): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  const body = (await req.json().catch(() => ({}))) as { publicIds?: string[] };
  return Response.json({ marked: await markRead(userId, body.publicIds) });
});
