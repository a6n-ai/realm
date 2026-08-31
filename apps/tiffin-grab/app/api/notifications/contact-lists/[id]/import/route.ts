import { handler, json, problem } from "@foundry/routes";
import { importContactListMembers, importMappingSchema, MAX_IMPORT_BYTES } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const deps = { db, tables: notificationTables, users: usersRef, resolveSegment };

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return problem(400, "Missing file");
    if (file.size > MAX_IMPORT_BYTES) return problem(413, "File is larger than 5MB");
    let mappingInput: unknown;
    try {
      mappingInput = JSON.parse(String(form.get("mapping") ?? "{}"));
    } catch {
      return problem(400, "Invalid column mapping");
    }
    const mapping = importMappingSchema.safeParse(mappingInput);
    if (!mapping.success) return problem(400, "Invalid column mapping");
    const result = await importContactListMembers(deps, id, file, mapping.data);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
