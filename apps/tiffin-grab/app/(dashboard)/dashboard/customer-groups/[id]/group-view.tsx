"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CoinsIcon, DownloadIcon, PlusIcon, Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { TableCell } from "@foundry/ui/table";
import { DataTable, PageHeader, PageShell, ResponsiveDialog, SectionCard } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import type { CustomerGroupRow, GroupActionRow, GroupMember } from "@/lib/services/customer-groups.service";
import { AccountSearch } from "../new/account-search";
import { addGroupMemberAction, exportGroupCsvAction, removeGroupMemberAction } from "../actions";
import { MemberStatuses } from "./member-statuses";

type MemberColumn = "name" | "email" | "phone" | "revenue" | "since" | "last" | "remove";
const MEMBER_COLUMNS = [
  { key: "name", label: "Customer" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
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

const ACTION_LABEL: Record<string, string> = { coins: "Gave coins", email: "Emailed", discount: "Applied coupon" };

function summary(a: GroupActionRow): string {
  const ids = (k: string) => (Array.isArray(a.result[k]) ? (a.result[k] as unknown[]).length : 0);
  if (a.kind === "coins") {
    const capped = ids("cappedUserIds");
    return `${a.params.coins} coins to ${ids("awardedUserIds")}${capped ? `, ${capped} blocked by cap` : ""}`;
  }
  if (a.kind === "discount") return String(a.params.couponCode ?? "");
  return "Campaign created";
}

export function GroupView({
  group,
  members,
  actions,
}: {
  group: CustomerGroupRow;
  members: GroupMember[];
  actions: GroupActionRow[];
}) {
  const router = useRouter();
  const tz = useTimezone();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => router.refresh();

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

  const exportCsv = () =>
    guarded("csv", async () => {
      const res = await exportGroupCsvAction(group.publicId);
      if (!res.ok) return res.error;
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${group.name.replace(/[\\/:*?"<>|]+/g, "_")}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return null;
    });

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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={busy === "csv"}>
              <DownloadIcon /> Export CSV
            </Button>
          </div>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
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
                rows={members}
                rowKey={(m) => m.publicId}
                serial={false}
                emptyIcon={UsersIcon}
                emptyMessage="This group has no customers yet."
                emptyAction={<Button onClick={() => setAdding(true)}><PlusIcon /> Add customer</Button>}
                renderRow={(m) => (
                  <>
                    <TableCell className="font-medium">{m.name ?? "Unnamed"}</TableCell>
                    <TableCell className="text-muted-foreground">{m.email ?? ""}</TableCell>
                    <TableCell className="text-muted-foreground">{m.phone ?? ""}</TableCell>
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
              rows={actions}
              rowKey={(a) => a.publicId}
              serial={false}
              emptyIcon={CoinsIcon}
              emptyMessage="Nothing has been done to this group yet."
              renderRow={(a) => (
                <>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatEpoch(a.createdAt, { mode: "datetime", timeZone: tz })}</TableCell>
                  <TableCell className="font-medium">{ACTION_LABEL[a.kind] ?? a.kind}</TableCell>
                  <TableCell className="text-muted-foreground">{a.createdBy ?? ""}</TableCell>
                  <TableCell>
                    {a.kind === "coins" ? (
                      <Button variant="link" onClick={() => setViewing(a.publicId)}>{summary(a)}</Button>
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
