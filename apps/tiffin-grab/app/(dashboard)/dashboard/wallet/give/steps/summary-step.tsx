"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircleIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { createGrantEmail, getCoinGrantGroupAction, retryGrantContactList } from "../../actions";
import { GrantMemberList } from "../grant-member-list";
import type { GrantGroup } from "../types";

export function SummaryStep({ groupId, listError, onReset }: { groupId: string; listError: string | null; onReset: () => void }) {
  const router = useRouter();
  const [data, setData] = React.useState<GrantGroup | null | undefined>(undefined);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, startBusy] = React.useTransition();

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      setData(await getCoinGrantGroupAction(groupId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load the group");
    }
  }, [groupId]);

  React.useEffect(() => {
    setData(undefined);
    void load();
  }, [load]);

  const retryList = () =>
    startBusy(async () => {
      try {
        await retryGrantContactList(groupId);
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not build the email list");
      }
    });

  const email = () =>
    startBusy(async () => {
      try {
        const { campaignPublicId } = await createGrantEmail(groupId);
        router.push(`/dashboard/notifications/campaigns/${campaignPublicId}?step=content`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not create the email");
      }
    });

  if (loadError)
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertDescription className="flex items-center justify-between gap-2">
          {loadError}
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  if (data === undefined) return <Skeleton className="h-64 w-full" />;
  if (data === null)
    return (
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertDescription className="flex items-center justify-between gap-2">
          This group no longer exists.
          <Button size="sm" variant="outline" onClick={onReset}>Start over</Button>
        </AlertDescription>
      </Alert>
    );

  const g = data.group;
  const noList = !g.contactListPublicId;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">{g.name}</h3>
        <p className="text-muted-foreground text-sm tabular-nums">
          {g.coins} coin{g.coins === 1 ? "" : "s"} each · {g.memberCount} customer{g.memberCount === 1 ? "" : "s"} · {g.awardedCount} awarded · {g.cappedCount} blocked by cap · {g.noEmailCount} without email
        </p>
      </div>
      {noList && (
        <Alert variant="warning">
          <AlertCircleIcon />
          <AlertDescription className="flex items-center justify-between gap-2">
            {listError ?? "The email list is not built yet."}
            <Button size="sm" variant="outline" onClick={retryList} disabled={busy}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}
      <GrantMemberList members={data.members} />
      <div className="flex gap-2">
        <Button onClick={email} disabled={busy}>{busy ? "Working..." : "Create email"}</Button>
        <Button variant="outline" asChild><Link href="/dashboard/wallet/groups">View all groups</Link></Button>
        <Button variant="ghost" onClick={onReset}>Give more coins</Button>
      </div>
    </div>
  );
}
