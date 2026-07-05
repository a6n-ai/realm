"use server";

import { and, desc, eq, ilike, or, type Column } from "drizzle-orm";
import { Role } from "@realm/commons";
import { db } from "@/db/client";
import { inquiries, orders, tickets, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export type SearchHit = { id: string; label: string; sub?: string; href: string };
export type SearchResults = {
  orders: SearchHit[];
  customers: SearchHit[];
  inquiries: SearchHit[];
  tickets: SearchHit[];
};

const EMPTY: SearchResults = { orders: [], customers: [], inquiries: [], tickets: [] };

// publicId is `<prefix>_<12-char nanoid>`, unique + indexed — match it exactly
// (a pasted full id) or by prefix (a typed leading fragment).
const idMatch = (col: Column, q: string) => or(eq(col, q), ilike(col, `${q}%`));

// Global command-palette search. Staff-only: customers get nav jumps only (the
// palette never calls this for them, but we fail closed here regardless).
// ilike '%q%' is fine — this is an interactive, capped, non-hot path.
export async function globalSearch(query: string): Promise<SearchResults> {
  const q = query.trim();
  if (q.length < 2) return EMPTY;

  const session = await getSession();
  const role = session?.user?.role;
  if (role !== Role.ADMIN && role !== Role.MEMBER) return EMPTY;

  const like = `%${q}%`;
  const [ord, cust, inq, tkt] = await Promise.all([
    db
      .select({ publicId: orders.publicId, fullName: orders.fullName, deploymentId: orders.deploymentId, status: orders.status })
      .from(orders)
      .where(or(idMatch(orders.publicId, q), ilike(orders.fullName, like), ilike(orders.deploymentId, like), ilike(orders.city, like)))
      .orderBy(desc(orders.createdAt))
      .limit(5),
    db
      .select({ publicId: users.publicId, email: users.email, phone: users.phone, name: users.name })
      .from(users)
      .where(and(eq(users.role, Role.USER), or(idMatch(users.publicId, q), ilike(users.email, like), ilike(users.phone, like), ilike(users.name, like))))
      .limit(5),
    db
      .select({ publicId: inquiries.publicId, fullName: inquiries.fullName, phone: inquiries.phone, stage: inquiries.stage })
      .from(inquiries)
      .where(or(idMatch(inquiries.publicId, q), ilike(inquiries.fullName, like), ilike(inquiries.phone, like), ilike(inquiries.email, like)))
      .orderBy(desc(inquiries.createdAt))
      .limit(5),
    db
      .select({ publicId: tickets.publicId, subject: tickets.subject, status: tickets.status, category: tickets.category, raiser: users.name })
      .from(tickets)
      .leftJoin(users, eq(users.id, tickets.raisedBy))
      .where(or(idMatch(tickets.publicId, q), ilike(tickets.subject, like)))
      .orderBy(desc(tickets.createdAt))
      .limit(5),
  ]);

  return {
    orders: ord.map((o) => ({ id: o.publicId, label: o.fullName, sub: `${o.deploymentId} · ${o.status}`, href: `/dashboard/orders/${o.publicId}` })),
    customers: cust.map((u) => ({ id: u.publicId, label: u.name ?? u.email ?? u.publicId, sub: u.email ?? u.phone ?? undefined, href: `/dashboard/customers/${u.publicId}` })),
    inquiries: inq.map((i) => ({ id: i.publicId, label: i.fullName, sub: `${i.phone} · ${i.stage}`, href: `/dashboard/inquiries/${i.publicId}` })),
    tickets: tkt.map((t) => ({ id: t.publicId, label: t.subject, sub: `${t.raiser ?? t.category} · ${t.status}`, href: `/dashboard/tickets/${t.publicId}` })),
  };
}
