import { and, desc, eq, or, sql } from "drizzle-orm";
import { NotFoundError, ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";
import { db } from "@/db/client";
import { account, inquiries, leadSources, orders, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

const TEMP_PASSWORD = "Tiffin123";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Find-or-provision a customer (role "user") by phone. Returns internal users.id.
// Lifted verbatim from createOrder so both paths share one provisioning rule.
export async function provisionCustomerByPhone(
  tx: Tx,
  contact: { fullName: string; phone: string; email: string | null },
  createdBy: bigint | null,
): Promise<bigint> {
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, contact.phone)).limit(1);
  if (existing) return existing.id;

  if (contact.email) {
    const [clash] = await tx.select({ id: users.id }).from(users).where(eq(users.email, contact.email)).limit(1);
    if (clash) throw new ValidationError("That email is already in use");
  }
  const inserted = await tx
    .insert(users)
    .values({ phone: contact.phone, email: contact.email, name: contact.fullName, role: "user", createdBy })
    .onConflictDoNothing({ target: users.phone, where: sql`${users.phone} is not null` })
    .returning({ id: users.id });
  if (inserted[0]?.id) {
    await tx.insert(account).values({
      accountId: String(inserted[0].id),
      providerId: "credential",
      userId: inserted[0].id,
      password: await hashPassword(TEMP_PASSWORD),
    });
    return inserted[0].id;
  }
  const [raced] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, contact.phone)).limit(1);
  return raced.id;
}

// Resolve the acting user's public_id to the internal id used for createdBy.
async function resolveActorId(tx: Tx, actorId: string | null | undefined): Promise<bigint | null> {
  if (!actorId) return null;
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.publicId, actorId)).limit(1);
  return row?.id ?? null;
}

// Customer-only creation (no order). Idempotent by phone.
export async function createCustomer(
  contact: { fullName: string; phone: string; email?: string },
  opts: { actorId?: string | null },
): Promise<{ publicId: string }> {
  const parsedPhone = phoneSchema().safeParse(contact.phone);
  if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
  let email: string | null = null;
  if (contact.email?.trim()) {
    const parsedEmail = emailSchema.safeParse(contact.email);
    if (!parsedEmail.success) throw new ValidationError("Enter a valid email");
    email = parsedEmail.data;
  }
  return db.transaction(async (tx) => {
    const createdBy = await resolveActorId(tx, opts.actorId);
    const id = await provisionCustomerByPhone(
      tx,
      { fullName: contact.fullName, phone: parsedPhone.data, email },
      createdBy,
    );
    const [row] = await tx.select({ publicId: users.publicId }).from(users).where(eq(users.id, id)).limit(1);
    return { publicId: row.publicId };
  });
}

export async function findExistingByContact(phone: string, email?: string | null) {
  const conds = [eq(sql`lower(${users.phone})`, phone.toLowerCase())];
  if (email) conds.push(eq(sql`lower(${users.email})`, email.toLowerCase()));
  const [row] = await db
    .select({ publicId: users.publicId, name: users.name })
    .from(users)
    .where(and(eq(users.role, "user"), or(...conds)))
    .limit(1);
  return row ? { publicId: row.publicId, fullName: row.name ?? "Customer" } : null;
}

export async function getCustomer360(userPublicId: string) {
  const [user] = await db
    .select({ id: users.id, publicId: users.publicId, email: users.email, phone: users.phone, role: users.role })
    .from(users)
    .where(eq(users.publicId, userPublicId))
    .limit(1);
  if (!user || user.role !== "user") throw new NotFoundError("Customer not found");

  const orderRows = await db
    .select({
      publicId: orders.publicId,
      deploymentId: orders.deploymentId,
      fullName: orders.fullName,
      city: orders.city,
      status: orders.status,
      startDate: orders.startDate,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt));

  const matchConds = [];
  if (user.email) matchConds.push(eq(sql`lower(${inquiries.email})`, user.email.toLowerCase()));
  if (user.phone) matchConds.push(eq(sql`lower(${inquiries.phone})`, user.phone.toLowerCase()));
  const inqRows = matchConds.length
    ? await db
        .select({
          publicId: inquiries.publicId,
          fullName: inquiries.fullName,
          stage: inquiries.stage,
          source: leadSources.label,
          createdAt: inquiries.createdAt,
        })
        .from(inquiries)
        .innerJoin(leadSources, eq(inquiries.sourceId, leadSources.id))
        .where(or(...matchConds))
        .orderBy(desc(inquiries.createdAt))
    : [];

  const timeline = [
    ...orderRows.map((o) => ({ id: `order:${o.publicId}`, kind: "order" as const, label: `Order ${o.deploymentId} (${o.status})`, at: o.createdAt })),
    ...inqRows.map((i) => ({ id: `inquiry:${i.publicId}`, kind: "inquiry" as const, label: `Inquiry from ${i.fullName} (${i.stage})`, at: i.createdAt })),
  ].sort((a, b) => b.at - a.at);

  return {
    profile: { publicId: user.publicId, email: user.email, phone: user.phone },
    orders: orderRows,
    inquiries: inqRows,
    timeline,
  };
}
