import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { requirePermission } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

/** Bulk Clover pull/push — route → ProductsService. */
export const POST = handler(async (request: Request): Promise<Response> => {
  await requirePermission({ product: ["sync"] });
  const body = (await request.json().catch(() => ({}))) as {
    direction?: unknown;
    publicIds?: unknown;
  };

  const direction = body.direction === "push" ? "push" : body.direction === "pull" ? "pull" : null;
  if (!direction) {
    throw new ValidationError('direction must be "pull" or "push"');
  }

  const publicIds = Array.isArray(body.publicIds)
    ? body.publicIds.filter((id): id is string => typeof id === "string")
    : undefined;

  return json(await productsService.syncCloverBulk(direction, publicIds));
});
