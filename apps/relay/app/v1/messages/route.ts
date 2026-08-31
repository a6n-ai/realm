import { z } from "zod";
import { enqueueTenant } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";
import { authenticateTenant } from "@/lib/tenants/auth";

const bodySchema = z.object({
  kind: z.enum(["transactional", "marketing"]).optional(),
  channels: z.array(z.enum(["email", "in_app", "sms", "whatsapp"])).optional(),
  to: z.object({
    userId: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  event: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  href: z.string().optional(),
  vars: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
});

export async function POST(req: Request) {
  const tenant = await authenticateTenant(req);
  if (!tenant) {
    return Response.json({ title: "Unauthorized", status: 401 }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ title: "Invalid JSON", status: 400 }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ title: "Invalid body", status: 400, issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;
  if (!input.to.email && !input.to.phone && !input.to.userId) {
    return Response.json({ title: "Recipient required", status: 400 }, { status: 400 });
  }
  await enqueueTenant(db, notificationTables, {
    tenantId: tenant.tenantId,
    event: input.event,
    recipientExternalId: input.to.userId,
    recipientEmail: input.to.email,
    recipientPhone: input.to.phone,
    title: input.title,
    body: input.body,
    href: input.href,
    data: input.vars,
    channels: input.channels ?? ["email"],
    kind: input.kind ?? "transactional",
    dedupeKey: input.idempotencyKey,
  });
  return Response.json({ accepted: true }, { status: 202 });
}
