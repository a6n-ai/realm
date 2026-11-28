import { runAction } from "@foundry/console/run-action";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { useRouter } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { errorText } from "../../lib/error-copy";
import { assignFn, claimFn } from "../../lib/inquiries/inquiries.fns";
import { OwnerAvatar } from "./owner-avatar";

export function OwnerControl({
  id,
  ownerId,
  ownerName,
  ownerRemoved,
  open,
  canAssign,
  owners,
}: {
  id: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerRemoved: boolean;
  open: boolean;
  canAssign: boolean;
  owners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const run = (action: () => Promise<unknown>, success: string) => runAction(action, success, () => router.invalidate(), errorText);
  const canClaim = open && ownerId === null;
  const choices = open && canAssign ? owners.filter((o) => o.id !== ownerId) : [];

  const who = (
    <>
      <OwnerAvatar name={ownerName} />
      {ownerName ? (
        <span className="truncate">
          <span className="font-medium text-(--strong)">{ownerName}</span>
          {ownerRemoved ? <span className="text-muted-foreground"> (removed)</span> : null}
        </span>
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      )}
    </>
  );

  if (!canClaim && choices.length === 0) return <span className="-my-1.5 flex h-8 items-center gap-2">{who}</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change owner"
        render={<button type="button" className="-my-1.5 -ml-2 flex h-8 max-w-full items-center gap-2 rounded-md px-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50" />}
      >
        {who}
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {canClaim ? <DropdownMenuItem onClick={() => run(() => claimFn({ data: { id } }), "Inquiry claimed")}>Claim</DropdownMenuItem> : null}
        {choices.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => run(() => assignFn({ data: { id, fromOwnerId: ownerId, toOwnerId: o.id } }), "Owner updated")}>
            {o.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
