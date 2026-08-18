import { handler, json, problem } from "@realm/routes";
import { NotFoundError, ValidationError } from "@realm/commons";
import { requirePermission } from "@/lib/auth/guards";
import { employeesService } from "@/lib/services/employees.service";

type Ctx = { params: Promise<{ id: string }> };

/** Single-employee Clover pull — same gate as inviting a user (staff provisioning). */
export const POST = handler(async (_request: Request, ctx: Ctx): Promise<Response> => {
  await requirePermission({ staff: ["invite"] });
  const { id } = await ctx.params;
  try {
    const result = await employeesService.pullOneFromClover(id);
    return json(result);
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    if (e instanceof NotFoundError) return problem(404, e.message);
    const msg = e instanceof Error ? e.message : "Sync failed";
    return problem(500, msg);
  }
});
