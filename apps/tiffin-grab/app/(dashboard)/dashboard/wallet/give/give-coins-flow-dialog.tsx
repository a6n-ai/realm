"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CoinsIcon, PlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Skeleton } from "@foundry/ui/skeleton";
import { ResponsiveDialog } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { NewGroupWizard } from "../../customer-groups/new/new-group-wizard";
import { GiveCoinsDialog } from "../../customer-groups/[id]/give-coins-dialog";
import { searchGroupsAction } from "../../customer-groups/actions";

type Group = { publicId: string; name: string; memberCount: number };
type Stage = "pick" | "create";

export function GiveCoinsFlowDialog({ cities, maxRows }: { cities: string[]; maxRows: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("pick");
  const [target, setTarget] = useState<{ publicId: string; count: number } | null>(null);

  const choose = (g: { publicId: string; count: number }) => {
    setOpen(false);
    setTarget(g);
  };

  return (
    <>
      <Button onClick={() => { setStage("pick"); setOpen(true); }}>
        <CoinsIcon /> Give coins
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={stage === "pick" ? "Give coins" : "New group"}
        description={
          stage === "pick"
            ? "Pick the group to give coins to, or create one."
            : "Find customers, review who is included, then save the group. You give coins next."
        }
        contentClassName={stage === "create" ? "sm:max-w-5xl" : undefined}
      >
        {open && stage === "pick" && <PickGroup onPick={(g) => choose({ publicId: g.publicId, count: g.memberCount })} onCreate={() => setStage("create")} />}
        {open && stage === "create" && (
          <NewGroupWizard cities={cities} maxRows={maxRows} onSaved={({ publicId, count }) => choose({ publicId, count })} />
        )}
      </ResponsiveDialog>
      {target && (
        <GiveCoinsDialog
          groupPublicId={target.publicId}
          memberCount={target.count}
          open
          onOpenChange={(o) => !o && setTarget(null)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  );
}

function PickGroup({ onPick, onCreate }: { onPick: (g: Group) => void; onCreate: () => void }) {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setError(null);
    try {
      const res = await searchGroupsAction(query);
      if (res.ok) setGroups(res.data);
      else setError(res.error);
    } catch {
      setError("The request did not finish.");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups by name" aria-label="Search groups" />
        <Button type="button" variant="outline" onClick={onCreate}>
          <PlusIcon /> Create group
        </Button>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            {error}
            <Button type="button" size="sm" variant="outline" onClick={() => void load(q)}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : groups === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-3 py-6 text-sm">
          <UsersIcon className="size-6" aria-hidden />
          {q ? "No group matches that name." : "No customer groups yet."}
          <Button type="button" onClick={onCreate}><PlusIcon /> Create group</Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {groups.map((g) => (
            <li key={g.publicId}>
              <Button type="button" variant="ghost" className="w-full justify-between" onClick={() => onPick(g)}>
                <span className="truncate">{g.name}</span>
                <span className="text-muted-foreground tabular-nums">{g.memberCount} customers</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
