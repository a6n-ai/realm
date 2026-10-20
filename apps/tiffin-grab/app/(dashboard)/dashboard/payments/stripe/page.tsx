import { Suspense } from "react";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { SectionCard } from "@/components/ds";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { payments } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { settleStaleOnView } from "@/lib/services/payment-stripe";
import { listPayments } from "../payment-queries";
import { StripeTable, StripeTableSkeleton } from "./stripe-table";

type SearchParams = Promise<Record<string, string | undefined>>;

// Server clock so expiry badges match on first paint (the table is a client component).
const serverNow = () => Date.now();

export default function StripePaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Stripe payments">
      <Suspense fallback={<StripeTableSkeleton />}>
        <StripeData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function StripeData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ finance: ["read"] });
  const role = (await getSession())?.user.role ?? "";
  const [{ rows, total, page, size, sort }, rt] = await Promise.all([
    listPayments(await searchParams, { where: eq(payments.method, "stripe") }),
    stripeRuntime(),
  ]);
  // Lazy status check on view (no cron): settle card payments the webhook may have missed.
  const unsettled = rows.filter((p) => p.status === "awaiting_payment" && p.providerRef);
  if (unsettled.length) after(() => settleStaleOnView(unsettled));
  return (
    <StripeTable
      rows={rows}
      total={total}
      page={page}
      size={size}
      sort={sort}
      now={serverNow()}
      livemode={rt?.cfg.livemode ?? false}
      canRefund={roleCan(role, { finance: ["refund"] })}
    />
  );
}
