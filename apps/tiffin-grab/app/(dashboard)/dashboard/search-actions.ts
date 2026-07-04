"use server";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Role } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiries, orders, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

export type SearchHit = { id: string; label: string; sub?: string; href: string };
export type SearchResults = { orders: SearchHit[]; customers: SearchHit[]; inquiries: SearchHit[] };

const EMPTY: SearchResults = { orders: [], customers: [], inquiries: [] };

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
  const [ord, cust, inq] = await Promise.all([
    db
      .select({ publicId: orders.publicId, fullName: orders.fullName, deploymentId: orders.deploymentId, status: orders.status })
      .from(orders)
      .where(or(ilike(orders.fullName, like), ilike(orders.deploymentId, like), ilike(orders.city, like)))
      .orderBy(desc(orders.createdAt))
      .limit(5),
    db
      .select({ publicId: users.publicId, email: users.email, phone: users.phone, name: users.name })
      .from(users)
      .where(and(eq(users.role, Role.USER), or(ilike(users.email, like), ilike(users.phone, like), ilike(users.name, like))))
      .limit(5),
    db
      .select({ publicId: inquiries.publicId, fullName: inquiries.fullName, phone: inquiries.phone, stage: inquiries.stage })
      .from(inquiries)
      .where(or(ilike(inquiries.fullName, like), ilike(inquiries.phone, like), ilike(inquiries.email, like)))
      .orderBy(desc(inquiries.createdAt))
      .limit(5),
  ]);

  return {
    orders: ord.map((o) => ({ id: o.publicId, label: o.fullName, sub: `${o.deploymentId} · ${o.status}`, href: `/dashboard/orders/${o.publicId}` })),
    customers: cust.map((u) => ({ id: u.publicId, label: u.name ?? u.email ?? u.publicId, sub: u.email ?? u.phone ?? undefined, href: `/dashboard/customers/${u.publicId}` })),
    inquiries: inq.map((i) => ({ id: i.publicId, label: i.fullName, sub: `${i.phone} · ${i.stage}`, href: `/dashboard/inquiries/${i.publicId}` })),
  };
}
