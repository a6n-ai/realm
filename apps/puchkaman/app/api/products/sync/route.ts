import { handler, json } from "@foundry/routes";
import { requirePermission } from "@/lib/auth/guards";
import { clearPublicCache } from "@/lib/public-cache";
import { productsService } from "@/lib/services/products.service";

/** Uber image sync — route → ProductsService → ProductsRepository. */
export const POST = handler(async (request: Request): Promise<Response> => {
  await requirePermission({ product: ["sync"] });
  const body = (await request.json().catch(() => ({}))) as {
    redownloadImages?: unknown;
    optimizeImages?: unknown;
  };
  try {
    return json(
      await productsService.syncUberImages({
        redownloadImages: !!body.redownloadImages,
        optimizeImages: body.optimizeImages === undefined ? true : !!body.optimizeImages,
      }),
    );
  } finally {
    // A sync that fails partway may still have written rows.
    clearPublicCache();
  }
});
