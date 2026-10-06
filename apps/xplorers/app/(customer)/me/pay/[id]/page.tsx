import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCardIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { formatMoney, Role } from "@foundry/commons";
import { CODE_ERROR_MESSAGE, type CodeError } from "@/lib/discounts/quote";
import { getSession } from "@/lib/auth/session";
import { paymentsService } from "@/lib/services/payments.service";
import { providerFor } from "@foundry/payments";
import { ClaimForm } from "../claim-form";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ codeError?: string }>;
}) {
  const auth = await getSession();
  if (!auth?.user || auth.user.role !== Role.USER) notFound();
  const [{ id }, { codeError }] = await Promise.all([params, searchParams]);
  const payment = await paymentsService.readForFamily(id, auth.user.id).catch(() => null);
  if (!payment) notFound();

  const initiated = providerFor(payment.methodConfig).initiate({
    orderRef: payment.bookingPublicId,
    amount: Number(payment.amount),
    method: payment.methodConfig,
  });

  let instructions: ReactNode;
  switch (initiated.kind) {
    case "manual_instructions":
      instructions = (
        <div className="text-muted-foreground mt-4 grid gap-2 text-sm">
          {initiated.payeeHandle ? <p>Send to {initiated.payeeHandle}</p> : null}
          {initiated.instructions ? <p>{initiated.instructions}</p> : null}
          <p>
            Include this reference: <span className="text-foreground font-medium">{initiated.reference}</span>
          </p>
        </div>
      );
      break;
    case "redirect":
    case "client_secret":
      instructions = <p className="text-muted-foreground mt-4 text-sm">This payment method is not available yet.</p>;
      break;
    default: {
      const _exhaustive: never = initiated;
      instructions = _exhaustive;
    }
  }

  return (
    <PageShell>
      <PageHeader icon={CreditCardIcon} title="Pay for your booking" subtitle={`Reference ${payment.bookingPublicId}`} />
      <SectionCard title={payment.methodConfig.label}>
        {codeError && codeError in CODE_ERROR_MESSAGE ? (
          <p className="mb-3 text-sm">Your code wasn&apos;t applied: {CODE_ERROR_MESSAGE[codeError as CodeError]}</p>
        ) : null}
        {payment.pricing && payment.pricing.adjustments.length ? (
          <dl className="text-muted-foreground mb-3 grid gap-1 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(payment.pricing.subtotal, payment.currency)}</dd>
            </div>
            {payment.pricing.adjustments.map((a) => (
              <div key={a.kind + a.publicId} className="flex justify-between">
                <dt>{a.kind === "wallet" ? `Wallet coins (${a.coins})` : a.code ? `Code ${a.code}` : a.name}</dt>
                <dd className="tabular-nums">−{formatMoney(a.amount, payment.currency)}</dd>
              </div>
            ))}
            {payment.pricing.taxTotal > 0 ? (
              <div className="flex justify-between">
                <dt>Tax</dt>
                <dd className="tabular-nums">{formatMoney(payment.pricing.taxTotal, payment.currency)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="text-2xl font-semibold tabular-nums">
          {payment.currency} {payment.amount}
        </p>
        {instructions}
        {payment.status === "awaiting_payment" || payment.status === "rejected" ? (
          <div className="mt-6">
            <ClaimForm publicId={payment.publicId} />
          </div>
        ) : (
          <p className="mt-6 text-sm">
            {payment.status === "pending_verification"
              ? "We're confirming your payment."
              : payment.status === "paid"
                ? "Paid. Your seat is confirmed."
                : payment.status}
          </p>
        )}
        <Button asChild variant="ghost" size="sm" className="mt-4">
          <Link href="/me">Back to bookings</Link>
        </Button>
      </SectionCard>
    </PageShell>
  );
}
