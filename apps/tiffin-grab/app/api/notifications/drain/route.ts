import { handler, problem } from "@realm/routes";
import { drainPending } from "@/lib/notifications/drain";

/**
 * Outbox drainer entrypoint. Triggered on a schedule by the Amplify
 * `notify-drainer` function (EventBridge). Guarded by a shared secret so it
 * can't be invoked publicly. All delivery logic lives in the app where `@/db`
 * works — the Lambda is just a thin trigger.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const secret = process.env.DRAIN_SECRET;
  if (!secret || req.headers.get("x-drain-secret") !== secret) {
    return problem(403, "Forbidden");
  }
  const processed = await drainPending();
  return Response.json({ processed });
});
