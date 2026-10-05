import { ValidationError } from "@foundry/commons";
import { handler, json } from "@foundry/routes";
import { requirePermission } from "@/lib/auth/guards";
import { clearPublicCache } from "@/lib/public-cache";
import { inventoryCatalogService } from "@/lib/services/inventory.service";

/** Pull Clover catalog / push categories — route → InventoryCatalogService. */
export const POST = handler(async (request: Request): Promise<Response> => {
  await requirePermission({ product: ["write"] });
  const body = (await request.json().catch(() => ({}))) as {
    direction?: unknown;
    publicIds?: unknown;
  };

  const direction =
    body.direction === "push_categories"
      ? "push_categories"
      : body.direction === "pull" || body.direction == null
        ? "pull"
        : null;
  if (!direction) {
    throw new ValidationError('direction must be "pull" or "push_categories"');
  }

  const publicIds = Array.isArray(body.publicIds)
    ? body.publicIds.filter((id): id is string => typeof id === "string")
    : undefined;

  try {
    if (direction === "push_categories") {
      return json({ direction, result: await inventoryCatalogService.pushCategories(publicIds) });
    }
    return json({ direction: "pull", result: await inventoryCatalogService.pullFromClover() });
  } finally {
    // A sync that fails partway may still have written rows.
    clearPublicCache();
  }
});
