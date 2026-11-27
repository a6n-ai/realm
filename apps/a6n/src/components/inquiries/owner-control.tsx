import { runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { errorText } from "../../lib/error-copy";
import { assignFn, claimFn } from "../../lib/inquiries/inquiries.fns";

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
  const [to, setTo] = useState("");
  const run = (action: () => Promise<unknown>, success: string) => runAction(action, success, async () => { setTo(""); await router.invalidate(); }, errorText);

  return (
    <div className="grid gap-3">
      <p>
        {ownerName ? (
          <>
            <span className="font-medium text-(--strong)">{ownerName}</span>
            {ownerRemoved ? <span className="text-muted-foreground"> (removed)</span> : null}
          </>
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </p>
      {open && ownerId === null ? (
        <Button variant="outline" onClick={() => run(() => claimFn({ data: { id } }), "Inquiry claimed")}>
          Claim inquiry
        </Button>
      ) : null}
      {open && canAssign ? (
        <div className="flex gap-2">
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger aria-label="Assign to" className="flex-1">
              <SelectValue placeholder="Assign to" />
            </SelectTrigger>
            <SelectContent>
              {owners
                .filter((o) => o.id !== ownerId)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button variant="outline" disabled={!to} onClick={() => run(() => assignFn({ data: { id, fromOwnerId: ownerId, toOwnerId: to } }), "Owner updated")}>
            Assign
          </Button>
        </div>
      ) : null}
    </div>
  );
}
