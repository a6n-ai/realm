import { findOwnedPayment, requireCustomerSession } from "@/lib/account/customer";
import { toCents } from "@/lib/money";
import { notFound } from "next/navigation";
import { cardPayClosed } from "@/lib/orders/display-status";
import { cardCheckoutContext } from "@/lib/payments/card-checkout-context";
import { resolveProvince } from "@/lib/tax/canada";
import { PayForm } from "./pay-form";
import { payPageLines } from "@/lib/billing/pay-lines";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const { paymentId } = await params;
  const session = await requireCustomerSession(`/me/pay/${paymentId}`);

  const row = await findOwnedPayment(paymentId, session.user.id);
  if (!row) notFound();

  const ctx = await cardCheckoutContext(session.user.id, resolveProvince({ postalCode: row.order.postalCode }), row.order);
  const pl = payPageLines(row.pay, row.order);
  const isReturn = (await searchParams).return === "1";

  return (
    <PayForm
      paymentId={paymentId}
      deploymentId={row.order.deploymentId}
      planTitle={row.meal}
      planSubtitle={row.plan}
      status={row.pay.status}
      method={row.pay.method}
      ctx={ctx}
      amountCents={toCents(row.pay.amount)}
      lines={[...pl.lines, ...pl.taxLines]}
      total={pl.total}
      isReturn={isReturn}
      closed={cardPayClosed(row.order.status, row.pay.expiresAt)}
    />
  );
}
