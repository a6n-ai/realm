import { handler, problem } from "@realm/routes";
import { drainPending } from "@/lib/notifications/drain";

/**
 * Manual drain kick. The scheduled path is the `drainer` compose service; this
 * exists so an operator can flush the queue without shelling into the box.
 * Guarded by a shared secret so it cannot be invoked publicly.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const secret = process.env.DRAIN_SECRET;
  if (!secret || req.headers.get("x-drain-secret") !== secret) {
    return problem(403, "Forbidden");
  }
  return Response.json({ processed: await drainPending() });
});
