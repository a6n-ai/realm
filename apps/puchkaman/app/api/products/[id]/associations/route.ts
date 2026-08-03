import { NotFoundError, ValidationError } from "@realm/commons";
import { handler, json, problem } from "@realm/routes";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { ASSOCIATION_KINDS, inventoryCatalogService } from "@/lib/services/inventory.service";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  kind: z.enum(ASSOCIATION_KINDS),
  publicIds: z.array(z.string().min(1)).max(200),
});

/**
 * Replace one relation's membership for a product (Clover's "Assign …" tables).
 * Writes locally, then mirrors the diff to Clover — see setProductAssociations.
 */
export const PUT = handler(async (request: Request, { params }: Params): Promise<Response> => {
  await requireAdmin();
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  try {
    return json(
      await inventoryCatalogService.setProductAssociations(
        id,
        parsed.data.kind,
        parsed.data.publicIds,
      ),
    );
  } catch (e) {
    if (e instanceof ValidationError) return problem(400, e.message);
    if (e instanceof NotFoundError) return problem(404, e.message);
    throw e;
  }
});
