import { z } from "zod";
import { desc } from "drizzle-orm";
import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { contactList } from "@/db/schema";

const schema = z.object({
  name: z.string().trim().min(1),
  // Consent provenance is captured when the list is CREATED, before any address
  // can be attached to it: an imported list has no consent record unless one is
  // supplied, and mailing a purchased or scraped list is not permitted.
  consentSource: z.enum(["purchase", "express_optin", "event_signup", "import_other"]),
  consentAt: z.number().int().positive(),
  consentNote: z.string().trim().optional(),
});

export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  const rows = await db
    .select({
      publicId: contactList.publicId,
      name: contactList.name,
      consentSource: contactList.consentSource,
      consentAt: contactList.consentAt,
      consentNote: contactList.consentNote,
      memberCount: contactList.memberCount,
      createdAt: contactList.createdAt,
    })
    .from(contactList)
    .orderBy(desc(contactList.createdAt));
  return json(rows);
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");

  const [row] = await db
    .insert(contactList)
    .values(parsed.data)
    .returning({ publicId: contactList.publicId });
  return json({ publicId: row.publicId });
});
