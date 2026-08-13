import { z } from "zod";
import { desc } from "drizzle-orm";
import { handler, json, problem } from "@realm/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign } from "@/db/schema";

const audienceSchema = z.object({
  segment: z
    .object({
      lastOrderAfter: z.number().int().optional(),
      lastOrderBefore: z.number().int().optional(),
      minOrderCount: z.number().int().positive().optional(),
      minTotalSpend: z.number().positive().optional(),
      requireVerifiedPhone: z.boolean().optional(),
    })
    .optional(),
  listIds: z.array(z.string()).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  channels: z.array(z.enum(["email", "in_app", "sms", "whatsapp"])).min(1),
  audience: audienceSchema,
  scheduledAt: z.number().int().positive().nullable().optional(),
});

export const GET = handler(async (): Promise<Response> => {
  await requireAdmin();
  const rows = await db
    .select({
      publicId: campaign.publicId,
      name: campaign.name,
      channels: campaign.channels,
      status: campaign.status,
      scheduledAt: campaign.scheduledAt,
      sentAt: campaign.sentAt,
      counts: campaign.counts,
      createdAt: campaign.createdAt,
    })
    .from(campaign)
    .orderBy(desc(campaign.createdAt));
  return json(rows);
});

export const POST = handler(async (req: Request): Promise<Response> => {
  await requireAdmin();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, parsed.error.issues[0]?.message ?? "Invalid request");

  const [row] = await db
    .insert(campaign)
    .values({
      name: parsed.data.name,
      channels: parsed.data.channels,
      audience: parsed.data.audience,
      // A campaign with a time is scheduled; without one it stays a draft until
      // someone presses Send.
      status: parsed.data.scheduledAt ? "scheduled" : "draft",
      scheduledAt: parsed.data.scheduledAt ?? null,
    })
    .returning({ publicId: campaign.publicId });
  return json({ publicId: row.publicId });
});
