import { handler, json, problem } from "@foundry/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { signalOutbox } from "@/lib/notifications/outbox-signal";

type IdCtx = { params: Promise<{ id: string }> };
type Opts = {
  /** Wake the outbox consumer after a successful result (a failure never signals). */
  signal?: (result: any) => boolean;
};

/** A returned Response passes through, `{ error, status }` becomes problem(), anything else is JSON. */
async function respond(result: unknown, opts?: Opts): Promise<Response> {
  if (result instanceof Response) return result;
  if (result && typeof result === "object" && "error" in result) {
    const { status, error } = result as { status: number; error: string };
    return problem(status, error);
  }
  if (opts?.signal?.(result)) await signalOutbox();
  return json(result);
}

export function adminRoute(fn: (req: Request) => Promise<unknown>, opts?: Opts) {
  return handler(async (req: Request): Promise<Response> => {
    await requireAdmin();
    return respond(await fn(req), opts);
  });
}

/** Same for a route under `[id]`: awaits `ctx.params` and hands `id` to `fn`. */
export function adminIdRoute(fn: (req: Request, id: string) => Promise<unknown>, opts?: Opts) {
  return handler(async (req: Request, ctx: IdCtx): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    return respond(await fn(req, id), opts);
  });
}
