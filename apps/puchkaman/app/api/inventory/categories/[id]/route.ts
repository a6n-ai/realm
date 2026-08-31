import { ValidationError } from "@foundry/commons";
import { handler, json, problem } from "@foundry/routes";
import { requirePermission } from "@/lib/auth/guards";
import { categoryEditSchema } from "@/lib/inventory/schema";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

type Params = { params: Promise<{ id: string }> };

/** Edit a Clover category. Saves locally then pushes to Clover — see updateCategory. */
export const PUT = handler(async (request: Request, { params }: Params): Promise<Response> => {
  await requirePermission({ product: ["write"] });
  const { id } = await params;
  const parsed = categoryEditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  try {
    return json(await inventoryCatalogService.updateCategory(id, parsed.data));
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    throw e;
  }
});
