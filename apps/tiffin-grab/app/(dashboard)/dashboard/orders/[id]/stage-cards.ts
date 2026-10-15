import { ActivityIcon, CalendarCheckIcon, CalendarClockIcon, PackageIcon, PauseIcon, ReceiptIcon, RefreshCwIcon, TruckIcon } from "lucide-react";
import type { OrdersStat } from "../stat-cards";

export type StageInput = {
  /** orderDisplayStatus: payment_review / rejected overlay the order status. */
  displayStatus: string;
  statusLabel: string;
  status: string;
  frequencyName: string;
  fullyPaused: boolean;
  /** No delivery has gone out yet, so the start date can still move. */
  notStarted: boolean;
  today: string;
  startDate: string;
  createdOn: string;
  meal: string;
  zoneName: string | null;
  tiffinCount: number;
  complimentaryTiffins: number;
  persons: number;
  counts: { total: number; delivered: number; remaining: number } | null;
  next: { date: string; driver: string | null } | null;
  /** Last non-cancelled delivery date, same rule as the orders list. */
  lastTiffin: string | null;
  unconfirmed: { units: number; dates: string[] };
  renewal: { deploymentId: string; startDate: string } | null;
  holds: { daysUsed: number; maxDays: number | null } | null;
  money: { paid: number; total: number; due: number; refunded: number; toReview: number };
  cancelledOn: string | null;
  fmt: (amount: number) => string;
  day: (iso: string) => string;
};

/** Days from `a` to `b` (ISO dates). */
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The header cards for one order: what staff needs at the stage the order is in. An unpaid plan
 * leads with money, a running one with tiffins and the next drop, a finished one with what was
 * delivered and whether the customer came back.
 */
export function stageCards(i: StageInput): OrdersStat[] {
  const total = i.counts?.total ?? i.tiffinCount + i.complimentaryTiffins;
  const extras = [
    i.complimentaryTiffins > 0 ? `${i.complimentaryTiffins} free` : null,
    i.persons > 1 ? `${i.persons} people, ${i.persons} tiffins a day` : null,
  ].filter(Boolean);
  const status = (hint: string): OrdersStat => ({ label: "Status", value: i.statusLabel, icon: ActivityIcon, hint });
  const balance: OrdersStat = {
    label: "Balance due",
    value: i.fmt(i.money.due),
    icon: ReceiptIcon,
    tone: i.money.due > 0 ? "bad" : "ok",
    hint: i.money.toReview > 0
      ? `${plural(i.money.toReview, "payment")} to review`
      : `${i.fmt(i.money.paid)} paid of ${i.fmt(i.money.total)}`,
  };
  const renewed: OrdersStat = i.renewal
    ? { label: "Renewed", value: "Yes", icon: RefreshCwIcon, tone: "ok", hint: `${i.renewal.deploymentId} starts ${i.day(i.renewal.startDate)}` }
    : { label: "Renewed", value: "Not yet", icon: RefreshCwIcon, hint: "No next plan booked" };
  // Always "left / total", even before the first drop, so staff read every stage the same way.
  const left: OrdersStat = {
    label: "Tiffins left",
    value: `${i.counts?.remaining ?? total} / ${total}`,
    icon: PackageIcon,
    hint: [`${i.counts?.delivered ?? 0} delivered`, ...extras].join(" · "),
  };
  const delivered: OrdersStat = {
    label: "Delivered",
    value: `${i.counts?.delivered ?? 0} / ${total}`,
    icon: PackageIcon,
    hint: [`tiffins confirmed by the driver`, ...extras].join(" · "),
  };

  if (i.status === "cancelled") {
    return [
      status(i.cancelledOn ? `Cancelled ${i.day(i.cancelledOn)}` : "Cancelled"),
      { ...delivered, hint: "delivered before it was cancelled" },
      {
        label: "Paid",
        value: i.fmt(i.money.paid),
        icon: ReceiptIcon,
        hint: i.money.refunded > 0 ? `${i.fmt(i.money.refunded)} refunded` : "Nothing refunded",
      },
      { label: "Last tiffin", value: i.lastTiffin ? i.day(i.lastTiffin) : "None", icon: CalendarCheckIcon, hint: `Started ${i.day(i.startDate)}` },
      renewed,
    ];
  }

  if (i.status === "completed") {
    const last: OrdersStat = { label: "Last tiffin", value: i.lastTiffin ? i.day(i.lastTiffin) : "None", icon: CalendarCheckIcon, hint: `Started ${i.day(i.startDate)}` };
    return i.unconfirmed.units > 0
      ? [
          status(i.lastTiffin ? `Last tiffin ${i.day(i.lastTiffin)}` : "Plan over"),
          {
            label: "Not confirmed",
            value: `${i.unconfirmed.units} / ${total}`,
            icon: PackageIcon,
            tone: "bad",
            hint: `${i.unconfirmed.dates.map(i.day).join(", ")} · settle in Orders → Missed deliveries`,
          },
          delivered,
          last,
          renewed,
        ]
      : [status("Plan over"), delivered, last, renewed, balance];
  }

  if (i.status === "waitlisted") {
    return [
      status("No delivery zone covers the address"),
      { ...left, hint: [i.meal, ...extras].join(" · ") },
      { label: "Waiting since", value: i.day(i.createdOn), icon: CalendarClockIcon, hint: plural(daysBetween(i.createdOn, i.today), "day") + " on the waitlist" },
      { label: "Requested start", value: i.day(i.startDate), icon: TruckIcon, hint: i.zoneName ?? "No zone yet" },
      balance,
    ];
  }

  // Unpaid or not yet started: money and the start date are what staff acts on.
  const unpaid = i.displayStatus === "payment_review" || i.displayStatus === "rejected" || i.status === "pending";
  if (unpaid || i.notStarted) {
    return [
      status(unpaid ? (i.displayStatus === "rejected" ? "Payment rejected" : "Not paid yet") : i.frequencyName),
      { ...left, hint: [i.meal, ...extras].join(" · ") },
      balance,
      {
        label: "Starts",
        value: i.day(i.startDate),
        icon: TruckIcon,
        hint: i.startDate >= i.today ? `in ${plural(daysBetween(i.today, i.startDate), "day")} · start date can change` : "start date can change",
      },
      {
        label: "Ends",
        value: i.lastTiffin ? i.day(i.lastTiffin) : "—",
        icon: CalendarCheckIcon,
        hint: i.lastTiffin ? `planned last tiffin · ${i.frequencyName}` : "Scheduled once the plan is active",
      },
    ];
  }

  // Running (active or paused).
  const endsIn = i.lastTiffin ? daysBetween(i.today, i.lastTiffin) : null;
  const ending = endsIn != null && endsIn <= 2;
  const cards: OrdersStat[] = [
    status(i.fullyPaused ? "All upcoming days paused" : i.money.due > 0 ? `${i.fmt(i.money.due)} still due` : i.frequencyName),
    left,
    { label: "Next delivery", value: i.next ? i.day(i.next.date) : "None", icon: TruckIcon, hint: i.next?.driver ?? (i.next ? "No driver yet" : "Nothing scheduled") },
    {
      label: "Hold days",
      value: i.holds ? (i.holds.maxDays != null ? `${i.holds.daysUsed} / ${i.holds.maxDays}` : i.holds.daysUsed) : "—",
      icon: PauseIcon,
      hint: i.holds?.maxDays != null ? `${plural(Math.max(i.holds.maxDays - i.holds.daysUsed, 0), "day")} left to pause` : "used on this plan",
    },
  ];
  cards.push(ending
    ? { ...renewed, hint: i.renewal ? renewed.hint : `Ends ${i.lastTiffin ? i.day(i.lastTiffin) : "soon"} · no next plan booked`, tone: i.renewal ? "ok" : "bad" }
    : { label: "Ends", value: i.lastTiffin ? i.day(i.lastTiffin) : "—", icon: CalendarCheckIcon, hint: endsIn != null ? `in ${plural(endsIn, "day")}` : "No deliveries yet" });
  return cards;
}
