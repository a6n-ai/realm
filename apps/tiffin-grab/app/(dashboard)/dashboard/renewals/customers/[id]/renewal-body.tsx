import { CalendarClockIcon, CoinsIcon, HourglassIcon, PackageIcon, RefreshCwIcon } from "lucide-react";
import { formatMoney as fmt } from "@foundry/commons";
import { SectionCard } from "@/components/ds";
import { StatCards } from "@/components/dashboard/stat-cards";
import { humanDate } from "@/lib/deliveries-view";
import type { CustomerRenewal } from "@/lib/services/renewals.service";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { formatEpoch } from "@/lib/format/datetime";
import { EstimateButton } from "../../estimate-button";
import { RenewControl } from "../../../orders/[id]/renew-control";
import { ContactButtons, GiveCoinsButton, SendReminderButton } from "./renewal-actions";
import { PlanHistory, RenewalReminders } from "./renewal-history";

const currentPlan = (data: CustomerRenewal) => [...data.plans].reverse().find((p) => p.status === "active" || p.status === "paused");

/** Renewal actions for one customer: contact, reminder, coins, estimate, renew. Shared by the Renewals page header and the customer's Renewals tab. */
export function RenewalActions({ data, isAdmin, giveCoins = true }: { data: CustomerRenewal; isAdmin: boolean; giveCoins?: boolean }) {
  const { customer, plans } = data;
  const current = currentPlan(data);
  const latest = plans[plans.length - 1];
  // Same rule as the order page's Renew: the newest paid plan, if nothing follows it yet.
  const renewFrom = [...plans].reverse().find((p) => !p.trial && ["active", "paused", "completed"].includes(p.status));
  const renewUrl = `${(process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "")}/me/renew`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ContactButtons name={customer.name} phone={customer.phone} renewUrl={renewUrl} />
      {current && current.next === "none" && !data.emailBlock && <SendReminderButton orderPublicId={current.orderPublicId} customerPublicId={customer.publicId} />}
      {giveCoins && isAdmin && <GiveCoinsButton customerPublicId={customer.publicId} />}
      <EstimateButton orderPublicId={latest.orderPublicId} />
      {renewFrom && <RenewControl orderId={renewFrom.orderPublicId} canRenew={renewFrom.next === "none"} />}
    </div>
  );
}

/** How often and how fast one customer renews, each plan and what followed it, and the reminders sent. */
export function RenewalSections({ data, today, timezone }: { data: CustomerRenewal; today: string; timezone: string }) {
  const { customer, plans, reminders } = data;
  const paid = plans.filter((p) => !p.trial);
  // One renewal per plan that something followed: the same rule as the Next plan badge.
  const renewals = plans.filter((p) => p.next !== "none").length;
  const gaps = plans.map((p) => p.gapDays).filter((g): g is number => g != null);
  const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const current = currentPlan(data);
  return (
    <>
      <StatCards
        items={[
          { label: "Plans", value: plans.length, icon: PackageIcon, hint: `${paid.length} paid · ${plans.length - paid.length} trial` },
          { label: "Renewals", value: renewals, icon: RefreshCwIcon, hint: renewals === 1 ? "Booked again once" : `Booked again ${renewals} times` },
          {
            label: "Average gap",
            value: avgGap == null ? "—" : `${avgGap} ${Math.abs(avgGap) === 1 ? "day" : "days"}`,
            icon: HourglassIcon,
            hint: "Last tiffin to next plan's start",
          },
          {
            label: "Current plan ends",
            value: current?.lastTiffin ? humanDate(current.lastTiffin) : "—",
            icon: CalendarClockIcon,
            hint: current ? `${current.mealSize} · ${current.next === "none" ? "not renewed yet" : "next plan booked"}` : "No plan running",
            ...(current && current.next === "none" ? { tone: "bad" as const } : {}),
          },
          { label: "Wallet", value: `${data.walletCoins} coins`, icon: CoinsIcon, hint: `${fmt(Number(data.totalSpent))} spent in total` },
        ]}
      />
      <SectionCard title="Plan history" subtitle="Oldest first. Each plan shows what came after it.">
        <PlanHistory plans={plans} today={today} />
      </SectionCard>
      <SectionCard title="Renewal reminders" subtitle="Emails sent 5 days and 1 day before a plan's last tiffin. Status comes from AWS; hover it for details.">
        <div className="flex flex-col gap-4">
          {data.emailBlock && (
            <Alert variant="destructive">
              <AlertTitle>{data.emailBlock.reason === "complaint" ? "Customer marked our email as spam" : "Customer's email address bounces"}</AlertTitle>
              <AlertDescription>
                Since {formatEpoch(data.emailBlock.since, { mode: "date", timeZone: timezone })} no email reaches {customer.email}, renewal reminders included. Call or WhatsApp instead.
              </AlertDescription>
            </Alert>
          )}
          <RenewalReminders reminders={reminders} plans={plans} />
        </div>
      </SectionCard>
    </>
  );
}
