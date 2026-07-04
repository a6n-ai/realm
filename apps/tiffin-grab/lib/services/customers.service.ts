import { and, desc, eq, or, sql } from "drizzle-orm";
import { NotFoundError, ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";
import { db } from "@/db/client";
import { account, inquiries, leadSources, mealSizes, orders, plans, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { ledgerService } from "./ledger.service";

// ponytail: SECURITY DEBT — every provisioned customer gets this same shared password,
// and /activate prints it on screen. Deferred 2026-07-01 (no email/SES wired yet). When
// notifications ship, replace with: provision with no usable password + a set-password
// token emailed via the existing notification system (app_event + template). See the
// account-activation spec (Spec A) in docs/superpowers/specs/.
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
  // Raw equality against the stored canonical values (phone is E.164, email is
  // lowercased on write) so the users_phone_unique / users_email_unique indexes
  // are usable — a lower() wrap forced a seq scan.
  const conds = [eq(users.phone, phone)];
  if (email) conds.push(eq(users.email, email.toLowerCase()));
  const [row] = await db
    .select({ publicId: users.publicId, name: users.name })
    .from(users)
    .where(and(eq(users.role, "user"), or(...conds)))
    .limit(1);
  return row ? { publicId: row.publicId, fullName: row.name ?? "Customer" } : null;
}

// Serializable order row for the customer's own dashboard. Carries plan + meal
// size names and pricing so the self-view never needs a follow-up read, and
// never exposes an internal bigint id (publicId only).
export type CustomerDashboardOrder = {
  publicId: string;
  deploymentId: string;
  planName: string;
  mealSizeName: string;
  durationWeeks: number;
  perTiffinPrice: string;
  total: string;
  status: string;
  startDate: string;
  createdAt: number;
};

export type CustomerDashboard = {
  profile: { name: string | null; email: string | null };
  current: CustomerDashboardOrder | null;
  orders: CustomerDashboardOrder[];
  ordersCount: number;
  activeCount: number;
  totalSpent: string;
};

// Live-status precedence for "the subscription that matters now": an active plan
// wins over a paused one, then waitlisted, then pending; a cancelled order is the
// fallback of last resort. Orders arrive newest-first, so ties resolve to the most
// recent of the winning status.
const SUBSCRIPTION_RANK: Record<string, number> = {
  active: 0, paused: 1, waitlisted: 2, pending: 3, cancelled: 4,
};

// The signed-in customer's own dashboard: profile, every order (newest-first), the
// current/most-relevant subscription, and lifetime spend. Resolves the user
// public_id to the internal id here so totalSpent can run on the bigint while the
// returned shape stays public_id-only and fully serializable for the client.
export async function getCustomerDashboard(userPublicId: string): Promise<CustomerDashboard> {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.publicId, userPublicId))
    .limit(1);
  if (!user || user.role !== "user") throw new NotFoundError("Customer not found");

  const [orderRows, totalSpent] = await Promise.all([
    db
      .select({
        publicId: orders.publicId,
        deploymentId: orders.deploymentId,
        planName: plans.name,
        mealSizeName: mealSizes.name,
        durationWeeks: orders.durationWeeks,
        perTiffinPrice: orders.perTiffinPrice,
        total: orders.total,
        status: orders.status,
        startDate: orders.startDate,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt)),
    ledgerService.totalSpent(user.id),
  ]);

  const current = orderRows.reduce<CustomerDashboardOrder | null>((best, o) => {
    if (!best) return o;
    const rank = SUBSCRIPTION_RANK[o.status] ?? Number.MAX_SAFE_INTEGER;
    const bestRank = SUBSCRIPTION_RANK[best.status] ?? Number.MAX_SAFE_INTEGER;
    return rank < bestRank ? o : best;
  }, null);

  return {
    profile: { name: user.name, email: user.email },
    current,
    orders: orderRows,
    ordersCount: orderRows.length,
    activeCount: orderRows.filter((o) => o.status === "active").length,
    totalSpent,
  };
}

export async function getCustomer360(userPublicId: string) {
  const [user] = await db
    .select({ id: users.id, publicId: users.publicId, email: users.email, phone: users.phone, role: users.role })
    .from(users)
    .where(eq(users.publicId, userPublicId))
    .limit(1);
  if (!user || user.role !== "user") throw new NotFoundError("Customer not found");

  const matchConds = [];
  if (user.email) matchConds.push(eq(sql`lower(${inquiries.email})`, user.email.toLowerCase()));
  if (user.phone) matchConds.push(eq(sql`lower(${inquiries.phone})`, user.phone.toLowerCase()));

  const [orderRows, inqRows] = await Promise.all([
    db
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
      .orderBy(desc(orders.createdAt)),
    matchConds.length
      ? db
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
      : Promise.resolve([]),
  ]);

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
