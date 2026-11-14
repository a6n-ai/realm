import { readBody } from "@foundry/commons/util/http";
import { handler, problem } from "@foundry/routes";
import { getFeed, markRead } from "@/lib/notifications/feed";
import { currentUserId } from "@/lib/services/session-service";

export const GET = handler(async (): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  return Response.json(await getFeed(userId));
});

export const POST = handler(async (req: Request): Promise<Response> => {
  const userId = await currentUserId();
  if (!userId) return problem(401, "Unauthorized");
  const body = await readBody<{ publicIds?: string[] }>(req, {});
  const marked = await markRead(userId, body.publicIds);
  return Response.json({ marked });
});
