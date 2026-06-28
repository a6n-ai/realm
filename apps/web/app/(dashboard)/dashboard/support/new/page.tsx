import { redirect } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { NewTicketForm, type TicketCategoryValue } from "./new-ticket-form";

const CATEGORIES: TicketCategoryValue[] = ["order", "billing", "catering", "general"];

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const { orderId } = await searchParams;
  const dashboard = await getCustomerDashboard(session.user.id);

  const orderOptions = dashboard.orders.map((o) => ({
    value: o.publicId,
    label: `${o.deploymentId} · ${o.planName}`,
  }));

  // A valid ?orderId= preselects the order and defaults the category to "order".
  const preselected = orderId && orderOptions.some((o) => o.value === orderId) ? orderId : undefined;

  return (
    <PageShell>
      <PageHeader
        icon={LifeBuoyIcon}
        title="New ticket"
        subtitle="Tell us what's going on and we'll take a look."
      />

      <SectionCard title="Details">
        <NewTicketForm
          categories={CATEGORIES}
          orders={orderOptions}
          defaultOrderId={preselected}
          defaultCategory={preselected ? "order" : "general"}
        />
      </SectionCard>
    </PageShell>
  );
}
