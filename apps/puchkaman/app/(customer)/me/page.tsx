import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { myOrdersPage } from "@/lib/customers/my-orders";
import { OrderSummaryList } from "@/components/customer/order-summary-list";

// Every read here is per-viewer and live; a cached render would show one
// customer's orders to another.
export default async function CustomerHomePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me");

  const [{ items: ongoing }, past] = await Promise.all([
    myOrdersPage(session.user.id, { ongoing: true, page: { page: 0, size: 50 } }),
    myOrdersPage(session.user.id, { ongoing: false, page: { page: 0, size: 5 } }),
  ]);

  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title="Your orders" subtitle="Everything you've ordered, ongoing first." />
      <SectionCard title="Ongoing">
        {ongoing.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            message="When you place an order it shows up here."
            action={
              <Button asChild>
                <Link href="/eats">Browse the menu</Link>
              </Button>
            }
          />
        ) : (
          <OrderSummaryList orders={ongoing} />
        )}
      </SectionCard>
      {past.total > 0 ? (
        <SectionCard title="Past orders">
          <OrderSummaryList orders={past.items} />
          {past.total > 5 ? (
            <Button asChild variant="ghost">
              <Link href="/me/orders">See all {past.total} orders</Link>
            </Button>
          ) : null}
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
