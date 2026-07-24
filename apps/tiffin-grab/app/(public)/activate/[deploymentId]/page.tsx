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
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm uppercase tracking-wide text-muted-foreground">Service deployment</p>
      <h1 className="mt-2 text-3xl font-semibold">{sub.deploymentId}</h1>
      <p className="mt-3 text-muted-foreground">
        {waitlisted
          ? "You're on the waitlist for your area — we'll email you when delivery opens."
          : claimable
            ? "Your subscription is reserved. Delivery begins once payment is confirmed."
            : "Your subscription is active. Welcome to Tiffin Grab!"}
      </p>

      {claimable && !waitlisted && (
        <Card className="mt-6 p-5 text-left text-sm">
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

      <Card className="mt-8 p-5 text-left text-sm">
        <div className="font-medium">Check your email</div>
        <p className="mt-1 text-muted-foreground">
          We&apos;ve emailed a link to set your password and finish setting up your account. Click it to sign
          in — or sign in any time with a one-time code we email you. Then manage your delivery schedule.
        </p>
        <Separator className="my-4" />
        <div className="font-medium">Pick your meals</div>
        <p className="mt-1 text-muted-foreground">
          Log in and open <span className="font-medium">My Meals</span> to choose your dishes for the
          coming week before the cutoff.
        </p>
        <a className="mt-2 inline-block text-primary underline" href="/dashboard/meals">
          Go to My Meals →
        </a>
      </Card>
    </main>
  );
}
