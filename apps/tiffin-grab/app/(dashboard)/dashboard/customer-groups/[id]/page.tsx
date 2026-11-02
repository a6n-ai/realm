import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CoinsIcon, HistoryIcon, MailIcon, PlayIcon, UsersIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { Skeleton } from "@foundry/ui/skeleton";
import { StatCards, type StatCardItem } from "@/components/dashboard/stat-cards";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getCustomerGroup, groupStats, listGroupActions } from "@/lib/services/customer-groups.service";
import { GroupView } from "./group-view";

const ACTION_LABEL: Record<string, string> = { coins: "Coins given", email: "Emailed", discount: "Coupon applied", campaign: "Campaign" };

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
  const [actions, s, { timezone }] = await Promise.all([listGroupActions(id), groupStats(id), getAppSettings()]);
  const cards: StatCardItem[] = [
    { label: "Members", value: s.members.toLocaleString(), icon: UsersIcon, hint: "customers in this group" },
    { label: "Email on", value: s.emailOn.toLocaleString(), icon: MailIcon, hint: "can be emailed" },
    { label: "Coins given", value: s.coinsGiven.toLocaleString(), icon: CoinsIcon, hint: "through this group" },
    { label: "Actions run", value: s.actionsRun.toLocaleString(), icon: PlayIcon, hint: "incl. campaigns" },
    {
      label: "Last action",
      value: s.lastAction ? (ACTION_LABEL[s.lastAction.kind] ?? s.lastAction.kind) : "None yet",
      icon: HistoryIcon,
      hint: s.lastAction ? formatEpoch(s.lastAction.createdAt, { mode: "date", timeZone: timezone }) : "nothing done yet",
    },
  ];
  return <GroupView group={detail.group} members={detail.members} actions={actions} stats={<StatCards items={cards} />} />;
}
