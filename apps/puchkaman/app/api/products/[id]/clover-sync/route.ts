import { ValidationError } from "@realm/commons";
import { handler, json } from "@realm/routes";
import { requirePermission } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

/**
 * Single-product Clover sync — route → ProductsService → ProductsRepository + Clover.
 * POST { direction: "pull" | "push" }
 */
export const POST = handler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  await requirePermission({ product: ["sync"] });
  const { id: publicId } = await params;
  const body = (await request.json().catch(() => ({}))) as { direction?: unknown };

  const direction = body.direction === "push" ? "push" : body.direction === "pull" ? "pull" : null;
  if (!direction) {
    throw new ValidationError('direction must be "pull" or "push"');
  }

  return json(await productsService.syncCloverOne(publicId, direction));
});
