import { handler, json, problem } from "@realm/routes";
import { importContactListMembers, importMappingSchema } from "@realm/notifications";
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
    if (file.size > 5 * 1024 * 1024) return problem(413, "File is larger than 5MB");
    const mapping = importMappingSchema.safeParse(JSON.parse(String(form.get("mapping") ?? "{}")));
    if (!mapping.success) return problem(400, "Invalid column mapping");
    const result = await importContactListMembers(deps, id, file, mapping.data);
    if ("error" in result) return problem(result.status, result.error);
    return json(result);
  },
);
