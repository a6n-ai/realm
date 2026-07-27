import { ValidationError } from "@realm/commons";
import { handler, json } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";
import type { CloverMatchIncoming } from "@/lib/sync/clover-inventory-types";

/**
 * Resolve an ambiguous Clover pull match — route → ProductsService.
 * Body: { action, incoming, existingPublicId? }
 */
export const POST = handler(async (request: Request): Promise<Response> => {
  await requireAdmin();
  const body = (await request.json().catch(() => ({}))) as {
    action?: unknown;
    incoming?: unknown;
    existingPublicId?: unknown;
  };

  const action = body.action;
  if (
    action !== "link" &&
    action !== "link_adopt" &&
    action !== "create" &&
    action !== "skip"
  ) {
    throw new ValidationError('action must be "link" | "link_adopt" | "create" | "skip"');
  }

  const incoming = parseIncoming(body.incoming);
  const existingPublicId =
    typeof body.existingPublicId === "string" ? body.existingPublicId : undefined;

  await productsService.resolveCloverAmbiguous(action, incoming, existingPublicId);
  return json({ ok: true });
});

function parseIncoming(raw: unknown): CloverMatchIncoming {
  if (!raw || typeof raw !== "object") throw new ValidationError("incoming is required");
  const o = raw as Record<string, unknown>;
  if (typeof o.cloverItemId !== "string" || !o.cloverItemId) {
    throw new ValidationError("incoming.cloverItemId is required");
  }
  if (typeof o.name !== "string" || !o.name.trim()) {
    throw new ValidationError("incoming.name is required");
  }
  const price = typeof o.price === "number" ? o.price : Number(o.price);
  if (!Number.isFinite(price)) throw new ValidationError("incoming.price is invalid");

  const hidden = o.hidden === true;
  const cloverAvailable = o.cloverAvailable !== false && o.available !== false;
  return {
    cloverItemId: o.cloverItemId,
    name: o.name,
    price,
    category: typeof o.category === "string" ? (o.category as CloverMatchIncoming["category"]) : "extra",
    available: cloverAvailable && !hidden,
    sku: typeof o.sku === "string" ? o.sku : null,
    code: typeof o.code === "string" ? o.code : null,
    alternateName: typeof o.alternateName === "string" ? o.alternateName : null,
    priceType: typeof o.priceType === "string" ? o.priceType : null,
    hidden,
    cloverAvailable,
    autoManage: typeof o.autoManage === "boolean" ? o.autoManage : null,
    cost: typeof o.cost === "number" && Number.isFinite(o.cost) ? o.cost : null,
    unitName: typeof o.unitName === "string" ? o.unitName : null,
    colorCode: typeof o.colorCode === "string" ? o.colorCode : null,
    stockQty: typeof o.stockQty === "number" && Number.isFinite(o.stockQty) ? o.stockQty : null,
  };
}
