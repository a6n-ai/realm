import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, payments, sectionSeen, tickets, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export type Section = "tickets" | "inquiries" | "customers" | "payments";
const SECTIONS: Section[] = ["tickets", "inquiries", "customers", "payments"];

async function actorId(): Promise<bigint | null> {
  const publicId = (await getSession())?.user?.id;
  if (!publicId) return null;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

async function seenMap(userId: bigint): Promise<Record<Section, number>> {
  const rows = await db
    .select({ section: sectionSeen.section, seenAt: sectionSeen.seenAt })
    .from(sectionSeen)
    .where(eq(sectionSeen.userId, userId));
  const map: Record<Section, number> = { tickets: 0, inquiries: 0, customers: 0, payments: 0 };
  for (const r of rows) map[r.section as Section] = r.seenAt;
  return map;
}

async function existsAfter(section: Section, since: number): Promise<boolean> {
  // ponytail: one EXISTS probe per section per sidebar render. created_at is
  // indexed on all three tables, so this is an index scan, not a seq scan;
  // if this ever shows up hot, cache per request.
  const probe = sql<number>`1`;
  if (section === "tickets") {
    const [r] = await db.select({ x: probe }).from(tickets).where(gt(tickets.createdAt, since)).limit(1);
    return Boolean(r);
  }
  if (section === "inquiries") {
    const [r] = await db.select({ x: probe }).from(inquiries).where(gt(inquiries.createdAt, since)).limit(1);
    return Boolean(r);
  }
  if (section === "payments") {
    // Dot tracks claims waiting on staff — claimedAt advances on (re)claim.
    const [r] = await db
      .select({ x: probe })
      .from(payments)
      .where(and(eq(payments.status, "pending_verification"), gt(payments.claimedAt, since)))
      .limit(1);
    return Boolean(r);
  }
  const [r] = await db
    .select({ x: probe })
    .from(users)
    .where(and(eq(users.role, "user"), gt(users.createdAt, since)))
    .limit(1);
  return Boolean(r);
}

export async function newActivity(): Promise<Record<Section, boolean>> {
  const uid = await actorId();
  if (uid == null) {
    return { tickets: false, inquiries: false, customers: false, payments: false };
  }
  const seen = await seenMap(uid);
  const [t, i, c, p] = await Promise.all([
    existsAfter("tickets", seen.tickets),
    existsAfter("inquiries", seen.inquiries),
    existsAfter("customers", seen.customers),
    existsAfter("payments", seen.payments),
  ]);
  return { tickets: t, inquiries: i, customers: c, payments: p };
}

export async function markRead(section: Section): Promise<void> {
  const uid = await actorId();
  if (uid == null) return;
  const now = Date.now();
  await db
    .insert(sectionSeen)
    .values({ userId: uid, section, seenAt: now })
    .onConflictDoUpdate({ target: [sectionSeen.userId, sectionSeen.section], set: { seenAt: now } });
}

export async function markAllRead(): Promise<void> {
  const uid = await actorId();
  if (uid == null) return;
  const now = Date.now();
  await db
    .insert(sectionSeen)
    .values(SECTIONS.map((section) => ({ userId: uid, section, seenAt: now })))
    .onConflictDoUpdate({ target: [sectionSeen.userId, sectionSeen.section], set: { seenAt: now } });
}
