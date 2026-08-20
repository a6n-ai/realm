import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { Card } from "@realm/ui/card";
import { Separator } from "@realm/ui/separator";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getClaimPaymentContext } from "@/lib/services/orders.service";
import { ClaimPayment } from "@/components/customer/wallet/claim-payment";

// Looks up an order by deploymentId — render per request, never prerender.
export const dynamic = "force-dynamic";

export default async function ActivatePage({ params }: { params: Promise<{ deploymentId: string }> }) {
  const { deploymentId } = await params;
  const [sub] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId)).limit(1);
  if (!sub) notFound();

  const [pay] = await db
    .select({ publicId: payments.publicId, status: payments.status })
    .from(payments)
    .where(eq(payments.orderId, sub.id))
    .limit(1);

  const waitlisted = sub.status === "waitlisted";
  const claimable =
    pay != null &&
    (pay.status === "awaiting_payment" ||
      pay.status === "pending_verification" ||
      pay.status === "rejected");

  const session = await getSession();
  let ownsOrder = false;
  if (session?.user?.id && sub.userId != null) {
    const [u] = await db
      .select({ publicId: users.publicId })
      .from(users)
      .where(eq(users.id, sub.userId))
      .limit(1);
    ownsOrder = u?.publicId === session.user.id;
  }

  const { currency } = await getAppSettings();
  const claimCtx =
    claimable && ownsOrder && pay ? await getClaimPaymentContext(pay.publicId) : null;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl items-center px-4 py-16">
      <div className="border-foreground w-full rounded-3xl border-[1.5px] bg-card p-8 text-center shadow-[8px_8px_0_var(--primary)]">
        {!waitlisted && (
          <div className="border-primary text-primary mb-5 inline-block rounded-lg border-[3.5px] px-5 py-2 text-xl font-bold tracking-widest uppercase">
            Subscribed ✓
          </div>
        )}
        <p className="text-muted-foreground text-sm uppercase tracking-wide">Service deployment</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{sub.deploymentId}</h1>
        <p className="mt-3 text-muted-foreground">
          {waitlisted
            ? "You're on the waitlist for your area — we'll email you when delivery opens."
            : claimable
              ? "Your subscription is reserved. Delivery begins once payment is confirmed."
              : "Your subscription is active. Welcome to Tiffin Grab!"}
        </p>

        {claimable && !waitlisted && (
          <Card className="border-foreground mt-6 rounded-2xl border-[1.5px] p-5 text-left text-sm">
            {claimCtx ? (
              <ClaimPayment ctx={claimCtx} currency={currency} />
            ) : (
              <>
                <div className="font-medium">Payment pending</div>
                <p className="mt-1 text-muted-foreground">
                  Send payment using the method you chose at checkout, then mark it as sent from
                  Finances. Until we confirm it, delivery won&apos;t start — you can move upcoming
                  days ahead from Deliveries if you need more time.
                </p>
                <a className="mt-2 inline-block text-primary underline" href="/me/wallet?tab=bills">
                  Open Finances →
                </a>
              </>
            )}
          </Card>
        )}

        <div className="border-foreground mt-8 flex flex-col gap-3 border-y-[1.5px] border-dashed py-4 text-left text-sm">
          <div className="flex gap-3">
            <span className="text-primary font-bold">01</span>
            <span>
              <strong>Set your password</strong> from the email we sent.
            </span>
          </div>
          <div className="flex gap-3">
            <span className="text-primary font-bold">02</span>
            <span>
              <strong>Pick your dishes</strong> in My Meals before each cutoff.
            </span>
          </div>
        </div>
        <a
          className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          href="/dashboard/meals"
        >
          Go to My Meals →
        </a>
      </div>
    </main>
  );
}
