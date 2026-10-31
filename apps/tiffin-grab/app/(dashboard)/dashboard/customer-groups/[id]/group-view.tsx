"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CoinsIcon, MailIcon, PlusIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { TableCell } from "@foundry/ui/table";
import { DataTable, PageHeader, PageShell, ResponsiveDialog, SearchInput, SectionCard, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import type { CustomerGroupRow, GroupActionRow, GroupMember } from "@/lib/services/customer-groups.service";
import { AccountSearch } from "../new/account-search";
import { addGroupMemberAction, removeGroupMemberAction } from "../actions";
import { GroupHeaderActions } from "../group-quick-actions";
import { MemberStatuses } from "./member-statuses";

type MemberColumn = "name" | "email" | "phone" | "coins" | "revenue" | "since" | "last" | "remove";
const MEMBER_COLUMNS = [
  { key: "name", label: "Customer" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "coins", label: "Wallet coins", align: "right" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "since", label: "Ordering since" },
  { key: "last", label: "Last tiffin" },
  { key: "remove", label: "", align: "right" },
] as const satisfies readonly { key: MemberColumn; label: string; align?: "right" }[];

type ActivityColumn = "when" | "action" | "by" | "result";
const ACTIVITY_COLUMNS = [
  { key: "when", label: "When" },
  { key: "action", label: "Action" },
  { key: "by", label: "By" },
  { key: "result", label: "Result" },
] as const satisfies readonly { key: ActivityColumn; label: string }[];

const ACTION_LABEL: Record<string, string> = { coins: "Gave coins", email: "Emailed", campaign: "Campaign", discount: "Applied coupon" };

function summary(a: GroupActionRow): string {
  const ids = (k: string) => (Array.isArray(a.result[k]) ? (a.result[k] as unknown[]).length : 0);
  if (a.kind === "coins") {
    const capped = ids("cappedUserIds");
    return `${a.params.coins} coins to ${ids("awardedUserIds")}${capped ? `, ${capped} blocked by cap` : ""}`;
  }
  if (a.kind === "discount") return String(a.params.couponCode ?? "");
  if (a.kind === "campaign") return `${a.params.name} (${a.params.status})`;
  return "Campaign created";
}

// Facets live in the URL (the shared ReUI filter bar writes there); the m_/a_ prefixes keep the two tabs apart.
const MEMBER_FACETS: FacetDef[] = [
  { kind: "pills", field: "m_email", label: "Email", options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }] },
  { kind: "pills", field: "m_wallet", label: "Wallet", options: [{ value: "has", label: "Has balance" }, { value: "none", label: "None" }] },
];
const FACET_KEYS = { members: ["m_email", "m_wallet"], activity: ["a_kind", "a_by"] } as const;

// Each table keeps its own search: DataTable's built-in one shares the URL `q`.
const matches = (q: string, ...fields: (string | null | undefined)[]) => {
  const t = q.trim().toLowerCase();
  return !t || fields.some((f) => f?.toLowerCase().includes(t));
};

const campaignId = (a: GroupActionRow) => (typeof a.result.campaignPublicId === "string" ? a.result.campaignPublicId : null);

export function GroupView({
  group,
  members,
  actions,
  stats,
}: {
  stats: ReactNode;
  group: CustomerGroupRow;
  members: GroupMember[];
  actions: GroupActionRow[];
}) {
  const router = useRouter();
  const tz = useTimezone();
  const [adding, setAdding] = useState(false);
  const [memberQ, setMemberQ] = useState("");
  const [activityQ, setActivityQ] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => router.refresh();
  const pathname = usePathname();
  const params = useSearchParams();
  const memberEmail = params.get("m_email");
  const memberWallet = params.get("m_wallet");
  const actionKind = params.get("a_kind");
  const actionBy = params.get("a_by");
  const clearFacets = (keys: readonly string[]) => {
    const sp = new URLSearchParams(params.toString());
    keys.forEach((k) => sp.delete(k));
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const activityFacets = useMemo<FacetDef[]>(
    () => [
      {
        kind: "pills",
        field: "a_kind",
        label: "Action",
        options: [
          { value: "coins", label: "Coins" },
          { value: "email", label: "Email" },
          { value: "discount", label: "Discount" },
          { value: "campaign", label: "Campaign" },
        ],
      },
      {
        kind: "select",
        field: "a_by",
        label: "By",
        options: [...new Set(actions.map((a) => a.createdBy).filter((n): n is string => !!n))].sort().map((n) => ({ value: n, label: n })),
      },
    ],
    [actions],
  );
  const shownMembers = members.filter(
    (m) =>
      matches(memberQ, m.name, m.email, m.phone) &&
      (!memberEmail || (memberEmail === "on") === (m.notifyEmail && !!m.email)) &&
      (!memberWallet || (memberWallet === "has") === m.coins > 0),
  );
  const shownActions = actions.filter(
    (a) =>
      matches(activityQ, ACTION_LABEL[a.kind] ?? a.kind, a.createdBy, summary(a)) &&
      (!actionKind || a.kind === actionKind) &&
      (!actionBy || a.createdBy === actionBy),
  );
  const memberFiltered = memberQ.trim() !== "" || !!memberEmail || !!memberWallet;
  const activityFiltered = activityQ.trim() !== "" || !!actionKind || !!actionBy;
  const memberTerm = memberQ.trim();
  const activityTerm = activityQ.trim();

  async function guarded(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    try {
      const err = await fn();
      if (err) setError(err);
    } catch {
      setError("The request did not finish.");
    } finally {
      setBusy(null);
    }
  }

  const remove = (m: GroupMember) =>
    guarded(`rm-${m.publicId}`, async () => {
      const res = await removeGroupMemberAction(group.publicId, m.publicId);
      if (!res.ok) return res.error;
      refresh();
      return null;
    });

  const add = (publicId: string) =>
    guarded("add", async () => {
      const res = await addGroupMemberAction(group.publicId, publicId);
      if (!res.ok) return res.error;
      refresh();
      return null;
    });

  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title={group.name}
        subtitle={`${group.memberCount} customer${group.memberCount === 1 ? "" : "s"}`}
        actions={
          <GroupHeaderActions publicId={group.publicId} name={group.name} />
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {stats}
      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="members">
          <SectionCard
            title="Members"
            action={
              <Button variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
                <UserPlusIcon /> Add customer
              </Button>
            }
          >
            <div className="flex flex-col gap-4">
              {adding && (
                <AccountSearch
                  placeholder="Search by name, email or phone"
                  exclude={new Set(members.map((m) => m.publicId))}
                  onPick={(a) => void add(a.publicId)}
                />
              )}
              <DataTable
                columns={MEMBER_COLUMNS}
                rows={shownMembers}
                filters={
                  <div className="flex flex-wrap items-center gap-2">
                    <SearchInput value={memberQ} onChange={setMemberQ} placeholder="Search by name, email or phone" shortPlaceholder="Search customers" />
                    <ReuiFacetFilters spec={MEMBER_FACETS} />
                  </div>
                }
                rowKey={(m) => m.publicId}
                serial={false}
                emptyIcon={UsersIcon}
                emptyMessage={memberTerm ? `No matches for "${memberTerm}"` : memberFiltered ? "No customers match these filters." : "This group has no customers yet."}
                emptyAction={
                  memberFiltered ? (
                    <Button variant="outline" size="sm" onClick={() => { setMemberQ(""); clearFacets(FACET_KEYS.members); }}>
                      {memberTerm ? "Clear search" : "Clear filters"}
                    </Button>
                  ) : (
                    <Button onClick={() => setAdding(true)}><PlusIcon /> Add customer</Button>
                  )
                }
                renderRow={(m) => (
                  <>
                    <TableCell className="font-medium">{m.name ?? "Unnamed"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email ?? ""}</TableCell>
                    <TableCell className="text-muted-foreground">{m.phone ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.coins.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">${Number(m.revenue).toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">{m.firstOrderDate ?? ""}</TableCell>
                    <TableCell className="tabular-nums">{m.lastTiffin ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.name ?? "customer"}`}
                        disabled={busy === `rm-${m.publicId}`}
                        onClick={() => void remove(m)}
                      >
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </>
                )}
              />
            </div>
          </SectionCard>
        </TabsContent>
        <TabsContent value="activity">
          <SectionCard title="Activity" subtitle="Everything done to this group, newest first.">
            <DataTable
              columns={ACTIVITY_COLUMNS}
              rows={shownActions}
              filters={
                <div className="flex flex-wrap items-center gap-2">
                  <SearchInput value={activityQ} onChange={setActivityQ} placeholder="Search action, person or campaign" shortPlaceholder="Search activity" />
                  <ReuiFacetFilters spec={activityFacets} />
                </div>
              }
              rowKey={(a) => a.publicId}
              serial={false}
              emptyIcon={CoinsIcon}
              emptyMessage={activityTerm ? `No matches for "${activityTerm}"` : activityFiltered ? "No activity matches these filters." : "Nothing has been done to this group yet."}
              emptyAction={
                activityFiltered ? (
                  <Button variant="outline" size="sm" onClick={() => { setActivityQ(""); clearFacets(FACET_KEYS.activity); }}>
                    {activityTerm ? "Clear search" : "Clear filters"}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button asChild><Link href="/dashboard/wallet/give"><CoinsIcon /> Give coins</Link></Button>
                    <Button asChild variant="outline"><Link href="/dashboard/notifications/campaigns"><MailIcon /> Email a group</Link></Button>
                  </div>
                )
              }
              renderRow={(a) => (
                <>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatEpoch(a.createdAt, { mode: "datetime", timeZone: tz })}</TableCell>
                  <TableCell className="font-medium">{ACTION_LABEL[a.kind] ?? a.kind}</TableCell>
                  <TableCell className="text-muted-foreground">{a.createdBy ?? ""}</TableCell>
                  <TableCell>
                    {a.kind === "coins" ? (
                      <Button variant="link" onClick={() => setViewing(a.publicId)}>{summary(a)}</Button>
                    ) : campaignId(a) ? (
                      <Button asChild variant="link">
                        <Link href={`/dashboard/notifications/campaigns/${campaignId(a)}`}>{summary(a)}</Link>
                      </Button>
                    ) : (
                      summary(a)
                    )}
                  </TableCell>
                </>
              )}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
      <ResponsiveDialog
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
        title="Coins given"
        description="Who received coins and who was blocked by the wallet cap."
      >
        {viewing && <MemberStatuses actionPublicId={viewing} />}
      </ResponsiveDialog>
    </PageShell>
  );
}
