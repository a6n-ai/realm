import { Suspense } from "react";
import { AlertCircleIcon, BanknoteIcon, ClockIcon, HourglassIcon, ReceiptIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentKpis, OVERDUE_DAYS } from "./payment-queries";

type SearchParams = Promise<Record<string, string | undefined>>;

const DAY_MS = 86_400_000;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function PaymentKpis({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<StatCardsSkeleton count={5} />}>
      <PaymentKpisData searchParams={searchParams} />
    </Suspense>
  );
}

async function PaymentKpisData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const now = Date.now();
  const k = await getPaymentKpis(await searchParams, now);
  const days = Math.round((k.range.to - k.range.from) / DAY_MS);
  const change = k.previousCollected > 0 ? Math.round(((k.collected - k.previousCollected) / k.previousCollected) * 100) : null;
  const oldestDays = k.toVerify.oldestAt == null ? null : Math.floor((now - k.toVerify.oldestAt) / DAY_MS);

  return (
    <StatCards
      items={[
        {
          icon: BanknoteIcon,
          label: "Collected",
          value: formatMoney(k.collected),
          hint: `${plural(k.collectedCount, "payment")} · ${change == null ? "none" : `${change > 0 ? "+" : ""}${change}%`} vs prior ${plural(days, "day")}`,
        },
        { icon: ReceiptIcon, label: "Orders paid", value: k.ordersPaid, hint: "orders with a paid payment" },
        {
          icon: HourglassIcon,
          label: "To verify",
          value: k.toVerify.count,
          hint: oldestDays == null ? "nothing waiting on staff" : `oldest ${oldestDays === 0 ? "today" : `${plural(oldestDays, "day")} ago`}`,
          tone: k.toVerify.count > 0 ? "bad" : undefined,
        },
        { icon: ClockIcon, label: "Awaiting payment", value: k.awaiting.count, hint: `${formatMoney(k.awaiting.amount)} owed, all dates` },
        {
          icon: AlertCircleIcon,
          label: "Overdue",
          value: k.overdue.count,
          hint: `${formatMoney(k.overdue.amount)} unpaid > ${OVERDUE_DAYS} days`,
          tone: k.overdue.count > 0 ? "bad" : undefined,
        },
      ]}
    />
  );
}
