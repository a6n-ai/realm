import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { Skeleton } from "@foundry/ui/skeleton";
import { getCustomerGroup, listGroupActions } from "@/lib/services/customer-groups.service";
import { GroupView } from "./group-view";

export default function CustomerGroupPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={
        <PageShell>
          <PageHeader icon={UsersIcon} title="Customer group" />
          <Skeleton className="h-64 w-full" />
        </PageShell>
      }
    >
      <GroupData params={params} />
    </Suspense>
  );
}

async function GroupData({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getCustomerGroup(id);
  if (!detail) notFound();
  const actions = await listGroupActions(id);
  return <GroupView group={detail.group} members={detail.members} actions={actions} />;
}
