import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { BackLink } from "@/components/back-link";
import {
  NewTicketForm,
  type TicketCategoryValue,
  NewTicketFormSkeleton,
} from "@/components/customer/support/new-ticket-form";

const CATEGORIES: TicketCategoryValue[] = ["order", "billing", "catering", "general"];

type SearchParams = Promise<{ orderId?: string }>;

export default function NewTicketPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <BackLink href="/me/support" label="Support" />

      <PageHeader
        icon={LifeBuoyIcon}
        title="New ticket"
        subtitle="Tell us what's going on — you can attach photos or screenshots, and link a plan if it helps."
      />

      <SectionCard title="Details" subtitle="Subject, category, and your message.">
        <Suspense fallback={<NewTicketFormSkeleton />}>
          <TicketFormData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function TicketFormData({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const { orderId } = await searchParams;
  const dashboard = await getCustomerDashboard(session.user.id);

  const orderOptions = dashboard.orders.map((o) => ({
    value: o.publicId,
    label: `${o.deploymentId} · ${o.planName}`,
  }));

  // A valid ?orderId= preselects the plan/order and defaults the category to "order".
  const preselected = orderId && orderOptions.some((o) => o.value === orderId) ? orderId : undefined;

  return (
    <NewTicketForm
      categories={CATEGORIES}
      orders={orderOptions}
      defaultOrderId={preselected}
      defaultCategory={preselected ? "order" : "general"}
    />
  );
}
