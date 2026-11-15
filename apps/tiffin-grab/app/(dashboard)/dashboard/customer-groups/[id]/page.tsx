import { ACTION_LABEL } from "@/lib/customer-groups/action-labels";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CoinsIcon, HistoryIcon, MailIcon, PlayIcon, UsersIcon } from "lucide-react";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { PageShell, PageHeader } from "@/components/ds";
import { Skeleton } from "@foundry/ui/skeleton";
import { StatCards, type StatCardItem } from "@/components/dashboard/stat-cards";
import { formatEpoch } from "@/lib/format/datetime";
import { getAppSettings } from "@/lib/settings";
import { getCustomerGroup, groupStats, listGroupActions } from "@/lib/customer-groups/customer-groups.service";
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
  await requirePagePermission({ customer: ["manage"] });
  const { id } = await params;
  const [canWallet, canFinance] = await Promise.all([can({ wallet: ["read"] }), can({ finance: ["read"] })]);
  const detail = await getCustomerGroup(id, { wallet: canWallet, finance: canFinance });
  if (!detail) notFound();
  const [actions, { timezone }] = await Promise.all([listGroupActions(id, { wallet: canWallet }), getAppSettings()]);
  const s = groupStats(detail, actions, { wallet: canWallet });
  const base = `/dashboard/customer-groups/${id}`;
  const cards: StatCardItem[] = [
    { label: "Members", value: s.members.toLocaleString(), icon: UsersIcon, hint: "customers in this group", href: base },
    { label: "Email on", value: s.emailOn.toLocaleString(), icon: MailIcon, hint: "can be emailed", href: `${base}?m_email=on` },
    ...(canWallet ? [{ label: "Coins given", value: s.coinsGiven.toLocaleString(), icon: CoinsIcon, hint: "through this group" }] : []),
    { label: "Actions run", value: s.actionsRun.toLocaleString(), icon: PlayIcon, hint: "incl. campaigns", href: `${base}?tab=activity` },
    {
      label: "Last action",
      value: s.lastAction ? (ACTION_LABEL[s.lastAction.kind] ?? s.lastAction.kind) : "None yet",
      icon: HistoryIcon,
      hint: s.lastAction ? formatEpoch(s.lastAction.createdAt, { mode: "date", timeZone: timezone }) : "nothing done yet",
    },
  ];
  return (
    <GroupView
      group={detail.group}
      members={detail.members}
      actions={actions}
      stats={<StatCards items={cards} />}
      canWallet={canWallet}
      canFinance={canFinance}
    />
  );
}
