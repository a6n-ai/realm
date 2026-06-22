import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { NotFoundError } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiries, orders, users } from "@/db/schema";

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
  if (user.email) matchConds.push(ilike(inquiries.email, user.email));
  if (user.phone) matchConds.push(eq(sql`lower(${inquiries.phone})`, user.phone.toLowerCase()));
  const inqRows = matchConds.length
    ? await db
        .select({
          publicId: inquiries.publicId,
          fullName: inquiries.fullName,
          stage: inquiries.stage,
          source: inquiries.source,
          createdAt: inquiries.createdAt,
        })
        .from(inquiries)
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
