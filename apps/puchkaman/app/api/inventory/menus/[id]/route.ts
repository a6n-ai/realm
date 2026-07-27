import { ValidationError } from "@realm/commons";
import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { menuSaveSchema } from "@/lib/menus/schema";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

type Params = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, { params }: Params): Promise<Response> => {
  await requireAdmin();
  const { id } = await params;
  return json(await inventoryCatalogService.menus.getDetail(id));
});

export const PUT = handler(async (request: Request, { params }: Params): Promise<Response> => {
  await requireAdmin();
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = menuSaveSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  try {
    return json(await inventoryCatalogService.saveMenu(id, parsed.data));
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    throw e;
  }
});
