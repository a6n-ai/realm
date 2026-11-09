import { DAY_MS } from "@foundry/commons/util/dates";
import { Suspense, type ReactNode } from "react";
import {
  ActivityIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  BanknoteIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  CreditCardIcon,
  HourglassIcon,
  ReceiptIcon,
  SigmaIcon,
  TicketPercentIcon,
  TimerOffIcon,
  Undo2Icon,
  WebhookIcon,
  WrenchIcon,
} from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
import { SectionDateRange } from "@/components/filters/section-date-range";
import { requireAdmin } from "@/lib/auth/guards";
import { withDefaultMonth } from "@/lib/list/default-month";
import { paymentsListHref, type PaymentsTabPath } from "@/lib/list/payments-drill";
import { countStripeAttention, getLedgerKpis, getLogKpis, getPaymentKpis, OVERDUE_DAYS, type PaymentKpis } from "./payment-queries";
import { PaymentsTabs } from "./payments-tabs";

type SearchParams = Promise<Record<string, string | undefined>>;
export type PaymentsTab = "all" | "etransfer" | "stripe" | "ledger" | "logs";

const TAB_PATH: Record<PaymentsTab, PaymentsTabPath> = {
  all: "all",
  etransfer: "requests",
  stripe: "stripe",
  ledger: "ledger",
  logs: "logs",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Same order as Orders and Renewals: the date range and the cards it moves, then the tabs. */
export function PaymentsTop({ tab, searchParams }: { tab: PaymentsTab; searchParams: SearchParams }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SectionDateRange />
        </div>
        <Suspense fallback={<StatCardsSkeleton count={5} />}>
          <PaymentKpisData tab={tab} searchParams={searchParams} />
        </Suspense>
      </div>
      <PaymentsTabs />
    </>
  );
}

type Dated = { from?: string; to?: string };

function collectedCard(k: PaymentKpis, tab: PaymentsTabPath, dates: Dated): StatCardItem {
  const days = Math.round((k.range.to - k.range.from) / DAY_MS);
  const change = k.previousCollected > 0 ? Math.round(((k.collected - k.previousCollected) / k.previousCollected) * 100) : null;
  return {
    icon: BanknoteIcon,
    label: "Collected",
    value: formatMoney(k.collected),
    hint: `${plural(k.collectedCount, "payment")} · ${change == null ? "none" : `${change > 0 ? "+" : ""}${change}%`} vs prior ${plural(days, "day")}`,
    href: paymentsListHref(tab, dates, { status: "paid" }),
  };
}

function overdueCard(k: PaymentKpis): StatCardItem {
  // Subset of awaiting_payment older than OVERDUE_DAYS — no exact list facet yet.
  return {
    icon: AlertCircleIcon,
    label: "Overdue",
    value: k.overdue.count,
    hint: `${formatMoney(k.overdue.amount)} unpaid > ${OVERDUE_DAYS} days`,
    tone: k.overdue.count > 0 ? "bad" : undefined,
  };
}

function toVerifyCard(k: PaymentKpis, now: number, label: string, tab: PaymentsTabPath, dates: Dated): StatCardItem {
  const oldestDays = k.toVerify.oldestAt == null ? null : Math.floor((now - k.toVerify.oldestAt) / DAY_MS);
  return {
    icon: HourglassIcon,
    label,
    value: k.toVerify.count,
    hint: oldestDays == null ? "nothing waiting on staff" : `oldest ${oldestDays === 0 ? "today" : `${plural(oldestDays, "day")} ago`}`,
    tone: k.toVerify.count > 0 ? "bad" : undefined,
    href: paymentsListHref(tab, dates, { status: "pending_verification" }),
  };
}

const awaitingCard = (k: PaymentKpis, tab: PaymentsTabPath, dates: Dated): StatCardItem => ({
  icon: ClockIcon,
  label: "Awaiting payment",
  value: k.awaiting.count,
  hint: `${formatMoney(k.awaiting.amount)} owed in selected range`,
  href: paymentsListHref(tab, dates, { status: "awaiting_payment" }),
});

async function cardsFor(tab: PaymentsTab, sp: Record<string, string | undefined>, now: number): Promise<StatCardItem[]> {
  const dates = await withDefaultMonth(sp);
  const path = TAB_PATH[tab];
  switch (tab) {
    case "etransfer": {
      const k = await getPaymentKpis(sp, now, "etransfer");
      return [
        collectedCard(k, path, dates),
        toVerifyCard(k, now, "Needs review", path, dates),
        awaitingCard(k, path, dates),
        overdueCard(k),
        {
          icon: CircleXIcon,
          label: "Rejected",
          value: k.rejectedCount,
          hint: "in selected range",
          href: paymentsListHref(path, dates, { status: "rejected" }),
        },
      ];
    }
    case "stripe": {
      const [k, attention] = await Promise.all([getPaymentKpis(sp, now, "stripe"), countStripeAttention(sp)]);
      return [
        collectedCard(k, path, dates),
        {
          icon: CreditCardIcon,
          label: "Card payments",
          value: k.collectedCount,
          hint: `${plural(k.ordersPaid, "order")} paid by card`,
          href: paymentsListHref(path, dates, { status: "paid" }),
        },
        {
          icon: ClockIcon,
          label: "Open links",
          value: k.awaiting.count - k.expired.count,
          hint: `${formatMoney(k.awaiting.amount - k.expired.amount)} owed in selected range`,
          href: paymentsListHref(path, dates, { status: "awaiting_payment" }),
        },
        {
          icon: TimerOffIcon,
          label: "Expired links",
          value: k.expired.count,
          hint: `${formatMoney(k.expired.amount)} never paid`,
          tone: k.expired.count > 0 ? "warn" : undefined,
          // Expired is a subset of awaiting_payment; list has no expiry facet yet.
        },
        {
          icon: AlertTriangleIcon,
          label: "Needs attention",
          value: attention,
          hint: "stuck, failed, flagged, disputed or webhook error",
          tone: attention > 0 ? "bad" : undefined,
          href: paymentsListHref(path, dates, {
            attention: "stuck,failed,flagged,disputed,event_error",
          }),
        },
      ];
    }
    case "ledger": {
      const l = await getLedgerKpis(sp);
      return [
        {
          icon: BanknoteIcon,
          label: "Payments in",
          value: formatMoney(l.payment.amount),
          hint: plural(l.payment.count, "payment"),
          href: paymentsListHref(path, dates, { type: "payment" }),
        },
        {
          icon: Undo2Icon,
          label: "Refunds",
          value: formatMoney(l.refund.amount),
          hint: plural(l.refund.count, "refund"),
          href: paymentsListHref(path, dates, { type: "refund" }),
        },
        {
          icon: TicketPercentIcon,
          label: "Discounts",
          value: formatMoney(l.discount.amount),
          hint: plural(l.discount.count, "discount"),
          href: paymentsListHref(path, dates, { type: "discount" }),
        },
        {
          icon: WrenchIcon,
          label: "Adjustments",
          value: formatMoney(l.adjustment.amount),
          hint: plural(l.adjustment.count, "adjustment"),
          href: paymentsListHref(path, dates, { type: "adjustment" }),
        },
        // Net is a composite of credits minus debits — not a single row set.
        { icon: SigmaIcon, label: "Net", value: formatMoney(l.net), hint: "credits minus debits", tone: l.net < 0 ? "bad" : undefined },
      ];
    }
    case "logs": {
      const g = await getLogKpis(sp);
      return [
        { icon: ActivityIcon, label: "Events", value: g.events, hint: `${plural(g.claimed, "customer claim")} · ${plural(g.webhooks, "webhook")}` },
        { icon: CircleCheckIcon, label: "Staff approved", value: g.verified, hint: "e-transfers approved" },
        { icon: CircleXIcon, label: "Staff rejected", value: g.rejected, hint: "e-transfers rejected" },
        {
          icon: WebhookIcon,
          label: "Webhook errors",
          value: g.webhookErrors,
          hint: `of ${plural(g.webhooks, "Stripe event")}`,
          tone: g.webhookErrors > 0 ? "bad" : undefined,
        },
        { icon: AlertCircleIcon, label: "Failed payments", value: g.failed, hint: "card payments that failed", tone: g.failed > 0 ? "warn" : undefined },
      ];
    }
    default: {
      const k = await getPaymentKpis(sp, now);
      return [
        collectedCard(k, path, dates),
        // Distinct orders with a paid payment — not a payment-row facet.
        { icon: ReceiptIcon, label: "Orders paid", value: k.ordersPaid, hint: "orders with a paid payment" },
        toVerifyCard(k, now, "To verify", path, dates),
        awaitingCard(k, path, dates),
        overdueCard(k),
      ];
    }
  }
}

async function PaymentKpisData({ tab, searchParams }: { tab: PaymentsTab; searchParams: SearchParams }): Promise<ReactNode> {
  await requireAdmin();
  return <StatCards items={await cardsFor(tab, await searchParams, Date.now())} />;
}
