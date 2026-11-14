import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { CircleAlertIcon, CreditCardIcon, DownloadIcon, TruckIcon, Undo2Icon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import { SectionCard } from "@/components/ds";
import { StatCards, type StatCardItem } from "@/components/dashboard/stat-cards";
import { orders } from "@/db/schema";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/settings";
import { listPayments } from "@/lib/payments/payments-list.service";
import { PaymentsTable, PaymentsTableSkeleton } from "../../../payments/payments-table";
import { loadCustomer, loadViewer } from "../data";

type SearchParams = Promise<Record<string, string | undefined>>;

/** Payments tab: what this customer has paid, owes and had refunded, then every payment across their orders. */
export default async function CustomerPaymentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const [data, { timezone }, { currency }, sp] = await Promise.all([loadCustomer(id), loadViewer(), getAppSettings(), searchParams]);
  // The export follows the filters open in the table; paging doesn't apply to a download.
  const exportQs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] != null && e[0] !== "page" && e[0] !== "size"));
  const { payment } = data;
  const money = (v: number) => formatMoney(v, currency);
  const cards: StatCardItem[] = [
    {
      label: "Total paid",
      value: money(payment.totalPaid),
      icon: CreditCardIcon,
      hint: payment.lastPaidAt ? `${payment.paidCount} payments · last ${formatEpoch(payment.lastPaidAt, { mode: "date", timeZone: timezone })}` : "No payments yet",
    },
    {
      label: "Outstanding",
      value: money(payment.outstanding.amount),
      icon: CircleAlertIcon,
      tone: payment.outstanding.amount > 0 ? "bad" : undefined,
      hint: payment.outstanding.count ? `${payment.outstanding.count} unpaid or rejected` : "Nothing owed",
    },
    { label: "Refunded", value: money(payment.refunded), icon: Undo2Icon, hint: `${data.orders.length} orders in total` },
    {
      label: "Last tiffin delivered",
      value: payment.lastDeliveredDate ? formatDateOnly(payment.lastDeliveredDate) : "—",
      icon: TruckIcon,
      hint: payment.lastDeliveredDate ? "Confirmed delivery" : "No confirmed delivery yet",
    },
  ];

  return (
    <>
      <StatCards items={cards} cols={4} />
      <SectionCard
        title="Payments"
        action={
          <Button variant="outline" asChild>
            <a href={`/api/customers/${id}/payments/export?${exportQs}`} download>
              <DownloadIcon />
              Export
            </a>
          </Button>
        }
      >
        <Suspense fallback={<PaymentsTableSkeleton scope="customer" />}>
          <CustomerPaymentsData userId={data.profile.id} searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </>
  );
}

async function CustomerPaymentsData({ userId, searchParams }: { userId: bigint; searchParams: SearchParams }) {
  const { rows, total, page, size, sort } = await listPayments(await searchParams, { where: eq(orders.userId, userId), allTime: true });
  return <PaymentsTable scope="customer" rows={rows} total={total} page={page} size={size} sort={sort} />;
}
