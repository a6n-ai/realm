import { and, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";

/**
 * Short link from anything that only knows an id — an OptimoRoute stop's orderNo (dlv_…),
 * an order id, or the WordPress/subscription reference (wc-…, SUB-…) — to the order's
 * Deliveries tab. Paste after /dashboard/go/.
 */
export default async function GoToOrder({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const id = decodeURIComponent((await params).id).trim();
  // Same org scope as the order page (readOrder), so an id from another franchise doesn't
  // even resolve to its order id.
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const inScope = visible === "all" ? undefined : inArray(orders.organizationId, visible);

  const match = id.startsWith("dlv_")
    ? eq(deliveries.publicId, id)
    : id.startsWith("ord_")
      ? eq(orders.publicId, id)
      : eq(orders.deploymentId, id);
  const [row] = id.startsWith("dlv_")
    ? await db
        .select({ publicId: orders.publicId })
        .from(deliveries)
        .innerJoin(orders, eq(deliveries.orderId, orders.id))
        .where(and(match, inScope))
        .limit(1)
    : await db.select({ publicId: orders.publicId }).from(orders).where(and(match, inScope)).limit(1);

  if (!row) notFound();
  redirect(`/dashboard/orders/${row.publicId}?tab=deliveries`);
}
