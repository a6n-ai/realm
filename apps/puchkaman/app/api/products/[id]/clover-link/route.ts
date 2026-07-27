import { ValidationError } from "@realm/commons";
import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

/**
 * Manual Clover link / unlink — route → ProductsService → ProductsRepository.
 * POST { action: "link", cloverItemId, adoptInventory? } | { action: "unlink" }
 */
export const POST = handler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  await requireAdmin();
  const { id: publicId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    cloverItemId?: unknown;
    adoptInventory?: unknown;
  };

  if (body.action === "unlink") {
    return json(await productsService.unlinkClover(publicId));
  }

  if (body.action !== "link") {
    throw new ValidationError('action must be "link" or "unlink"');
  }
  if (typeof body.cloverItemId !== "string" || !body.cloverItemId.trim()) {
    throw new ValidationError("cloverItemId is required to link");
  }

  return json(
    await productsService.linkClover(publicId, body.cloverItemId.trim(), {
      adoptInventory: Boolean(body.adoptInventory),
    }),
  );
});
