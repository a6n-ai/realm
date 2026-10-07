import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { usersService } from "@/lib/services/users.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { PageHeader } from "@/components/customer/kit";
import { BackLink } from "@/components/customer/support/parts";
import { NewTicketControl } from "@/components/customer/support/new-ticket-control";
import { TicketsList, TicketsListSkeleton } from "@/components/customer/support/tickets-list";
import { TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { TopicCards } from "@/components/customer/support/topic-cards";

type SearchParams = Promise<{ orderId?: string }>;

export default function SupportPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/me/account" label="Account" />
      <Suspense fallback={<PageHeader eyebrow="Support" title="How can we" accent="help?" subtitle="Pick a topic or start a new ticket. We reply right here." />}>
        <SupportHeader searchParams={searchParams} />
      </Suspense>
      <TopicCards />
      <Suspense fallback={<TicketsListSkeleton />}>
        <TicketsData />
      </Suspense>
    </div>
  );
}

async function SupportHeader({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const { orderId } = await searchParams;
  const dashboard = await getCustomerDashboard(session.user.id);
  const orderOptions = dashboard.orders.map((o) => ({
    value: o.publicId,
    label: [o.deploymentId, o.planName, o.mealSizeName].filter(Boolean).join(" · "),
  }));
  // A valid ?orderId= preselects the plan/order and defaults the category to "order".
  const preselected = orderId && orderOptions.some((o) => o.value === orderId) ? orderId : undefined;

  return (
    <PageHeader
      eyebrow="Support"
      title="How can we"
      accent="help?"
      subtitle="Pick a topic or start a new ticket. We reply right here."
      action={
        <NewTicketControl
          categories={TICKET_CATEGORIES}
          orders={orderOptions}
          defaultOrderId={preselected}
          {...(preselected ? { defaultCategory: "order" as const } : {})}
        />
      }
    />
  );
}

async function TicketsData() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const [{ timezone }, user] = await Promise.all([
    getAppSettings(),
    usersService.read(session.user.id),
  ]);
  const tickets = await ticketsService.listForCustomer(user.id);

  return <TicketsList tickets={tickets} timezone={timezone} />;
}
