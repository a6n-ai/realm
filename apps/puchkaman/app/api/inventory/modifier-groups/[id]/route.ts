import { ValidationError } from "@realm/commons";
import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { modifierGroupEditSchema } from "@/lib/inventory/schema";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

type Params = { params: Promise<{ id: string }> };

/** Edit a Clover modifier group. Saves locally then pushes — see updateModifierGroup. */
export const PUT = handler(async (request: Request, { params }: Params): Promise<Response> => {
  await requireAdmin();
  const { id } = await params;
  const parsed = modifierGroupEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  try {
    return json(await inventoryCatalogService.updateModifierGroup(id, parsed.data));
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    throw e;
  }
});
