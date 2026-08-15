import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { mapRows, parseCsv } from "@realm/notifications";
import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { contactList, contactListMember } from "@/db/schema";

const MAX_BYTES = 5 * 1024 * 1024;

const mappingSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
});

export const POST = handler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> => {
    await requireAdmin();
    const { id } = await ctx.params;

    const form = await req.formData();
    const file = form.get("file");
    const mapping = mappingSchema.safeParse(JSON.parse(String(form.get("mapping") ?? "{}")));
    if (!(file instanceof File)) return problem(400, "Missing file");
    if (file.size > MAX_BYTES) return problem(413, "File is larger than 5MB");
    if (!mapping.success) return problem(400, "Invalid column mapping");
    if (!mapping.data.email && !mapping.data.phone) {
      return problem(400, "Map an email or phone column");
    }

    const [list] = await db
      .select({ id: contactList.id })
      .from(contactList)
      .where(eq(contactList.publicId, id));
    if (!list) return problem(404, "List not found");

    const { valid, rejected } = mapRows(parseCsv(await file.text()), mapping.data);

    let imported = 0;
    for (let i = 0; i < valid.length; i += 500) {
      const slice = valid.slice(i, i + 500);
      const inserted = await db
        .insert(contactListMember)
        .values(
          slice.map((c) => ({
            listId: list.id,
            email: c.email ?? null,
            phone: c.phone ?? null,
            name: c.name ?? null,
            vars: c.vars,
          })),
        )
        // Re-importing the same export must not duplicate members.
        .onConflictDoNothing()
        .returning({ id: contactListMember.id });
      imported += inserted.length;
    }

    await db
      .update(contactList)
      .set({
        memberCount: sql`(select count(*) from ${contactListMember} where ${contactListMember.listId} = ${list.id})`,
      })
      .where(eq(contactList.id, list.id));

    // The uploaded file is NOT persisted: the members are the record of what was
    // imported, and keeping a raw contact dump is personal data with no purpose.
    return json({ imported, rejected });
  },
);
