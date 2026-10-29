import { notFound } from "next/navigation";
import { CalendarClockIcon, CoinsIcon, HourglassIcon, PackageIcon, RefreshCwIcon } from "lucide-react";
import { formatMoney as fmt, zonedDateIso } from "@foundry/commons";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { StatCards } from "@/components/dashboard/stat-cards";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { humanDate } from "@/lib/deliveries-view";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { getCustomerRenewal } from "@/lib/services/renewals.service";
import { EstimateButton } from "../../estimate-button";
import { RenewControl } from "../../../orders/[id]/renew-control";
import { ContactButtons, GiveCoinsButton, SendReminderButton } from "./renewal-actions";
import { PlanHistory, RenewalReminders } from "./renewal-history";

/** One customer's renewals only: how often and how fast they renew, each plan and what followed it, and the reminders sent. */
export default async function CustomerRenewalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ order: ["read"] });
  const { id } = await params;
  const session = await getSession();
  const [visible, { timezone }] = await Promise.all([resolveSessionVisibleOrgIds(session), getAppSettings()]);
  const data = await getCustomerRenewal(visible, id);
  if (!data) notFound();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);

  const { customer, plans, reminders } = data;
  const paid = plans.filter((p) => !p.trial);
  const renewals = plans.filter((_, i) => i > 0 && plans.slice(0, i).some((p) => p.status !== "pending" && p.status !== "waitlisted")).length;
  const gaps = plans.map((p) => p.gapDays).filter((g): g is number => g != null);
  const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const current = [...plans].reverse().find((p) => p.status === "active" || p.status === "paused");
  const latest = plans[plans.length - 1];
  // Same rule as the order page's Renew: the newest paid plan, if nothing follows it yet.
  const renewFrom = [...plans].reverse().find((p) => !p.trial && ["active", "paused", "completed"].includes(p.status));
  const renewUrl = `${(process.env.BETTER_AUTH_URL ?? "").replace(/\/+$/, "")}/me/renew`;

  return (
    <PageShell>
      <PageHeader
        icon={RefreshCwIcon}
        title={customer.name || "Unnamed customer"}
        subtitle={[customer.phone, customer.email].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ContactButtons name={customer.name} phone={customer.phone} renewUrl={renewUrl} />
            {current && current.next === "none" && <SendReminderButton orderPublicId={current.orderPublicId} customerPublicId={customer.publicId} />}
            {session?.user?.role === "admin" && <GiveCoinsButton customerPublicId={customer.publicId} />}
            <EstimateButton orderPublicId={latest.orderPublicId} />
            {renewFrom && <RenewControl orderId={renewFrom.orderPublicId} canRenew={renewFrom.next === "none"} />}
          </div>
        }
      />
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
      <SectionCard title="Renewal reminders" subtitle="Emails sent 5 days and 1 day before a plan's last tiffin.">
        <RenewalReminders reminders={reminders} plans={plans} />
      </SectionCard>
    </PageShell>
  );
}
