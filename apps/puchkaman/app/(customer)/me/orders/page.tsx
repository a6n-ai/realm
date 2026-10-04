import Link from "next/link";
import { redirect } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { EmptyState, ListPagination, PageHeader, PageShell, SectionCard, parseFilterState } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getSession } from "@/lib/auth/session";
import { myOrdersPage } from "@/lib/customers/my-orders";
import { OrderSummaryList } from "@/components/customer/order-summary-list";

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=/me/orders");

  const { page } = parseFilterState([], await searchParams);
  const [{ items: ongoing }, past] = await Promise.all([
    myOrdersPage(session.user.id, { ongoing: true, page: { page: 0, size: 50 } }),
    myOrdersPage(session.user.id, { ongoing: false, page }),
  ]);

  if (ongoing.length === 0 && past.total === 0) {
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
      {past.total > 0 ? (
        <SectionCard title="Past">
          <OrderSummaryList orders={past.items} />
          <ListPagination page={past.page} size={past.size} total={past.total} />
        </SectionCard>
      ) : null}
    </PageShell>
  );
}
