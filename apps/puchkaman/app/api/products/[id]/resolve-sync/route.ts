import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { productsService } from "@/lib/services/products.service";

const VALID_ACTIONS = [
  "apply_name",
  "apply_description",
  "apply_price",
  "apply_image",
  "apply_all",
  "ignore",
] as const;

type PendingAction = (typeof VALID_ACTIONS)[number];

/** Apply Uber pendingSync fields — route → ProductsService. */
export const POST = handler(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> => {
  await requireAdmin();
  const { id } = await params;
  const body = (await request.json()) as { action?: string };
  if (!body.action || !(VALID_ACTIONS as readonly string[]).includes(body.action)) {
    return problem(400, "Invalid action");
  }
  return json(await productsService.applyUberPending(id, body.action as PendingAction));
});
