import { Suspense } from "react";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { SectionCard } from "@/components/ds";
import { requirePermission, roleCan } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { payments } from "@/db/schema";
import { stripeRuntime } from "@/lib/payments/stripe";
import { createLogger } from "@foundry/commons/logger";
import { settleStripePayment } from "@/lib/services/payment-stripe";
import { listPayments } from "../payment-queries";
import { StripeTable, StripeTableSkeleton } from "./stripe-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const log = createLogger("stripe-view-settle");

export default function StripePaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Card payments (Stripe)">
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
  const stale = rows.filter(
    (p) => p.status === "awaiting_payment" && p.providerRef && (p.providerCheckedAt ?? 0) < Date.now() - 120_000,
  );
  if (stale.length) {
    after(async () => {
      for (const p of stale) await settleStripePayment({ paymentRef: p.publicId }, "view").catch((e) => log.error({ paymentId: p.publicId, err: e }, "lazy stripe settle failed"));
    });
  }
  return (
    <StripeTable
      rows={rows}
      total={total}
      page={page}
      size={size}
      sort={sort}
      livemode={rt?.cfg.livemode ?? false}
      canRefund={roleCan(role, { finance: ["refund"] })}
    />
  );
}
