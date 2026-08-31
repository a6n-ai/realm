import { handler, json, problem } from "@foundry/routes";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { cloverCustomersService } from "@/lib/services/clover-customers.service";

type Ctx = { params: Promise<{ id: string }> };

/** Emails a Clover customer with no app account a link to order online. */
export const POST = handler(async (_request: Request, ctx: Ctx): Promise<Response> => {
  await requirePermission({ clover: ["read"] });
  const { id } = await ctx.params;
  try {
    await cloverCustomersService.inviteToOrder(id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    if (e instanceof NotFoundError) return problem(404, e.message);
    const msg = e instanceof Error ? e.message : "Invite failed";
    return problem(500, msg);
  }
});
