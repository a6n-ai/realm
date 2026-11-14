import Link from "next/link";
import { inStatuses, UNPAID } from "@/lib/payments/status";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2Icon, ClockIcon, HourglassIcon } from "lucide-react";
import { Card } from "@foundry/ui/card";
import { StaticMapClient } from "@/components/maps/static-map-client";
import { getSession } from "@/lib/auth/session";
import { stripeMethodAvailable } from "@/lib/payments/stripe";
import { getAppSettings } from "@/lib/settings";
import { loadActivation } from "@/lib/account/order-access";
import { getClaimPaymentContext } from "@/lib/payments/verification";
import { ClaimPayment } from "@/components/customer/wallet/claim-payment";

// Looks up an order by deploymentId — render per request, never prerender.
export const dynamic = "force-dynamic";

export default async function ActivatePage({ params }: { params: Promise<{ deploymentId: string }> }) {
  const { deploymentId } = await params;
  // proxy.ts sends cookie-less visitors to /login; this catches an expired session.
  const session = await getSession();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/activate/${deploymentId}`)}`);

  const found = await loadActivation(deploymentId, session);
  if (!found) notFound();
  const { order: sub, payment: pay, owns: ownsOrder } = found;

  const waitlisted = sub.status === "waitlisted";
  const inReview = pay?.status === "pending_verification";
  const needsPayment = pay != null && (inStatuses(UNPAID, pay.status));
  const claimable = inReview || needsPayment;

  const { currency } = await getAppSettings();
  const claimCtx =
    claimable && ownsOrder && pay ? await getClaimPaymentContext(pay.publicId) : null;

  const cardAvailable = claimCtx?.methodId === "stripe" ? await stripeMethodAvailable() : false;

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
            {claimCtx?.methodId === "stripe" && !cardAvailable ? (
              <p className="text-muted-foreground">Card payments are paused right now. Please contact us.</p>
            ) : claimCtx?.methodId === "stripe" ? (
              <Link
                className="bg-primary text-primary-foreground inline-flex h-11 items-center rounded-full px-6 text-sm font-semibold"
                href={`/me/pay/${claimCtx.paymentPublicId}`}
              >
                Pay by card
              </Link>
            ) : claimCtx ? (
              <ClaimPayment ctx={claimCtx} currency={currency} />
            ) : (
              <p className="text-muted-foreground">
                Sign in to see payment details and confirm what you sent.{" "}
                <Link className="text-primary font-medium underline-offset-4 hover:underline" href="/me/wallet?tab=bills">
                  Open Finances
                </Link>
              </p>
            )}
          </div>
        )}

        {sub.latitude != null && sub.longitude != null && (
          <div className="mt-6 overflow-hidden rounded-2xl border">
            <StaticMapClient
              center={{ lat: sub.latitude, lng: sub.longitude }}
              markers={[{ lat: sub.latitude, lng: sub.longitude }]}
              heightPx={180}
            />
          </div>
        )}

        {waitlisted ? (
          <Link
            className="border-border text-foreground mt-6 inline-flex h-12 items-center justify-center rounded-full border px-6 text-sm font-semibold transition-transform active:scale-[0.98]"
            href="/"
          >
            Back to home
          </Link>
        ) : claimable ? (
          <Link
            className="border-border text-foreground mt-6 inline-flex h-12 items-center justify-center rounded-full border px-6 text-sm font-semibold transition-transform active:scale-[0.98]"
            href="/me"
            transitionTypes={["nav-forward"]}
          >
            Back to home
          </Link>
        ) : (
          <Link
            className="bg-primary text-primary-foreground mt-6 inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold transition-transform active:scale-[0.98]"
            href="/me"
            transitionTypes={["nav-forward"]}
          >
            View my deliveries
          </Link>
        )}
      </Card>
    </main>
  );
}
