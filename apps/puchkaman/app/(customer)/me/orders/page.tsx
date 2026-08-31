import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { myOrders, splitOrders } from "@/lib/customers/my-orders";
import { OrderSummaryList } from "@/components/customer/order-summary-list";

export default async function CustomerOrdersPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/orders");

  const { ongoing, past } = splitOrders(await myOrders(session.user.id));

  if (ongoing.length === 0 && past.length === 0) {
    return (
      <PageShell>
        <PageHeader icon={PackageIcon} title="Orders" />
        <EmptyState
          icon={PackageIcon}
          message="Your order history will appear here once you've ordered."
          action={
            <Button asChild>
              <Link href="/eats">Browse the menu</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title="Orders" subtitle="Ongoing first, then everything before." />
      {ongoing.length > 0 ? (
        <SectionCard title="Ongoing">
          <OrderSummaryList orders={ongoing} />
        </SectionCard>
      ) : null}
      {past.length > 0 ? (
        <SectionCard title="Past">
          <OrderSummaryList orders={past} />
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
