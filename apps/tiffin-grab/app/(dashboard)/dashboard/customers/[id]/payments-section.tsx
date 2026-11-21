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
import { PaymentsTable, PaymentsTableSkeleton } from "../../payments/payments-table";
import { loadCustomer, loadCustomerPayments, loadViewer } from "./data";

type SearchParams = Promise<Record<string, string | undefined>>;

/** What this customer has paid, owes and had refunded (finance:read; loadCustomerPayments enforces it). */
export async function PaymentSummaryCards({ id }: { id: string }) {
  const [{ payment, orderCount }, { timezone }, { currency }] = await Promise.all([loadCustomerPayments(id), loadViewer(), getAppSettings()]);
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
    { label: "Refunded", value: money(payment.refunded), icon: Undo2Icon, hint: `${orderCount} orders in total` },
    {
      label: "Last tiffin delivered",
      value: payment.lastDeliveredDate ? formatDateOnly(payment.lastDeliveredDate) : "—",
      icon: TruckIcon,
      hint: payment.lastDeliveredDate ? "Confirmed delivery" : "No confirmed delivery yet",
    },
  ];
  return <StatCards items={cards} cols={4} />;
}

/** Every payment across the customer's orders, with export (finance:read). */
export async function PaymentsSection({ id, searchParams }: { id: string; searchParams: SearchParams }) {
  const sp = await searchParams;
  // The export follows the filters open in the table; paging doesn't apply to a download.
  const exportQs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => e[1] != null && e[0] !== "page" && e[0] !== "size"));
  return (
    <SectionCard
      title="Payments"
      action={
        <Button variant="outline" render={<a href={`/api/customers/${id}/payments/export?${exportQs}`} download />}>
            <DownloadIcon />
            Export
          </Button>
      }
    >
      <Suspense fallback={<PaymentsTableSkeleton scope="customer" />}>
        <PaymentsData id={id} sp={sp} />
      </Suspense>
    </SectionCard>
  );
}

async function PaymentsData({ id, sp }: { id: string; sp: Record<string, string | undefined> }) {
  const { profile } = await loadCustomer(id);
  const { rows, total, page, size, sort } = await listPayments(sp, { where: eq(orders.userId, profile.id), allTime: true });
  return <PaymentsTable scope="customer" rows={rows} total={total} page={page} size={size} sort={sort} />;
}
