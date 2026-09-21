import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { CheckCircle2Icon, ClockIcon, HourglassIcon } from "lucide-react";
import { Card } from "@foundry/ui/card";
import { StaticMap } from "@foundry/design-system";
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
  const inReview = pay?.status === "pending_verification";
  const needsPayment = pay != null && (pay.status === "awaiting_payment" || pay.status === "rejected");
  const claimable = inReview || needsPayment;

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

  const state = waitlisted
    ? {
        Icon: HourglassIcon,
        title: "You're on the waitlist",
        body: "Delivery isn't open in your area yet. We'll email you the moment it is.",
      }
    : inReview
      ? {
          Icon: ClockIcon,
          title: "Waiting for confirmation",
          body: "We're checking your payment. Your plan starts as soon as it's approved.",
        }
      : needsPayment
        ? {
            Icon: ClockIcon,
            title: "Almost there",
            body: "Your plan is reserved. Send your payment to get it started.",
          }
        : {
            Icon: CheckCircle2Icon,
            title: "You're subscribed",
            body: "Your plan is active. Welcome to Tiffin Grab.",
          };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Card className="gap-0 rounded-3xl p-6 shadow-sm sm:p-8">
        <span className="bg-primary/15 text-primary grid size-12 place-items-center rounded-full">
          <state.Icon className="size-6" />
        </span>
        <h1 className="mt-5 text-[1.75rem] leading-tight font-semibold tracking-tight">{state.title}</h1>
        <p className="text-muted-foreground mt-2 text-[0.95rem] leading-relaxed">{state.body}</p>
        <p className="text-muted-foreground mt-4 text-xs">
          Order <span className="text-foreground font-medium tabular-nums">{sub.deploymentId}</span>
        </p>

        {claimable && !waitlisted && (
          <div className="bg-muted/40 mt-6 rounded-2xl p-4 text-sm">
            {claimCtx ? (
              <ClaimPayment ctx={claimCtx} currency={currency} />
            ) : (
              <p className="text-muted-foreground">
                Sign in to see payment details and confirm what you sent.{" "}
                <a className="text-primary font-medium underline-offset-4 hover:underline" href="/me/wallet?tab=bills">
                  Open Finances
                </a>
              </p>
            )}
          </div>
        )}

        {sub.latitude != null && sub.longitude != null && (
          <div className="mt-6 overflow-hidden rounded-2xl border">
            <StaticMap
              center={{ lat: sub.latitude, lng: sub.longitude }}
              markers={[{ lat: sub.latitude, lng: sub.longitude }]}
              heightPx={180}
            />
          </div>
        )}

        {!claimable && !waitlisted && (
          <a
            className="bg-primary text-primary-foreground mt-6 inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold transition-transform active:scale-[0.98]"
            href="/me"
          >
            View my deliveries
          </a>
        )}
      </Card>
    </main>
  );
}
