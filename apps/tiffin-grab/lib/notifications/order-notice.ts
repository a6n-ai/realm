import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { orders, users } from "@/db/schema";
import { enqueueNotification, type EnqueueInput } from "./enqueue";
import { orderTemplateVars, type AppEvent } from "./events";

type Channel = NonNullable<EnqueueInput["channels"]>[number];

/** Customer notice about an order, with the `{{order.*}}` vars filled; a guest order (no user) sends nothing. */
export async function enqueueOrderNotice(
  tx: Tx,
  orderId: bigint,
  n: { event: AppEvent; title: string; body: string; dedupeKey: string; extra?: Record<string, string>; href?: string; channels?: Channel[]; vars?: (o: { code: string; customerName: string }) => Record<string, unknown> },
): Promise<void> {
  const [o] = await tx
    .select({ userId: orders.userId, code: orders.deploymentId, name: users.name })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!o?.userId) return;
  await enqueueNotification(tx, {
    event: n.event,
    recipientId: o.userId,
    title: n.title,
    body: n.body.replaceAll("{code}", o.code),
    href: n.href ?? "/me/deliveries",
    channels: n.channels,
    data: n.vars ? n.vars({ code: o.code, customerName: o.name || "there" }) : { order: orderTemplateVars(o.code, o.name, n.extra) },
    dedupeKey: n.dedupeKey,
  });
}
