import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { getCoinGrantGroup } from "@/lib/services/coin-grants.service";
import { CreateGrantEmailButton, RetryGrantListButton } from "../grant-group-actions";
import { GrantMemberList } from "../../give/grant-member-list";

type Params = Promise<{ id: string }>;

export default function GroupDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <GroupDetail params={params} />
    </Suspense>
  );
}

async function GroupDetail({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const data = await getCoinGrantGroup(id);
  if (!data) notFound();
  const g = data.group;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{g.name}</h2>
        <p className="text-muted-foreground text-sm tabular-nums">
          {g.coins} coin{g.coins === 1 ? "" : "s"} each · {g.memberCount} customer{g.memberCount === 1 ? "" : "s"} · {g.awardedCount} awarded ·{" "}
          {g.cappedCount} blocked by cap · {g.noEmailCount} without email
        </p>
      </div>
      {!g.contactListPublicId && (
        <Alert variant="warning">
          <AlertCircleIcon />
          <AlertDescription className="flex items-center justify-between gap-2">
            The email list is not built yet.
            <RetryGrantListButton groupId={g.publicId} />
          </AlertDescription>
        </Alert>
      )}
      <GrantMemberList members={data.members} />
      <div className="flex gap-2">
        <CreateGrantEmailButton groupId={g.publicId} />
        <Button variant="outline" asChild>
          <Link href="/dashboard/wallet/groups">All groups</Link>
        </Button>
      </div>
    </div>
  );
}
