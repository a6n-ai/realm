import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { stripeRuntime } from "@/lib/payments/stripe";
import { PayForm } from "./pay-form";
import { payPageLines } from "./lines";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { paymentId } = await params;
  const session = await getSession();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/me/pay/${paymentId}`)}`);

  const [row] = await db
    .select({ pay: payments, order: orders })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(payments.publicId, paymentId), eq(users.publicId, session.user.id)))
    .limit(1);
  if (!row) notFound();

  const rt = await stripeRuntime();
  const pl = payPageLines(row.pay, row.order);
  const isReturn = (await searchParams).return === "1";

  return (
    <PayForm
      paymentId={paymentId}
      status={row.pay.status}
      method={row.pay.method}
      publishableKey={rt?.cfg.publishableKey ?? null}
      amountCents={Math.round(Number(row.pay.amount) * 100)}
      lines={[...pl.lines, ...pl.taxLines]}
      total={pl.total}
      isReturn={isReturn}
    />
  );
}
