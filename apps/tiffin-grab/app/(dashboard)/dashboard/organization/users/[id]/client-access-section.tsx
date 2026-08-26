"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { addMemberAction, removeMemberAction } from "@/lib/services/organizations-actions";
import type { UserMembershipRow } from "@/lib/services/organizations.service";

export function ClientAccessSection({
  userPublicId,
  memberships,
}: {
  userPublicId: string;
  memberships: UserMembershipRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [orgId, setOrgId] = useState("");

  return (
    <div className="space-y-3">
      {memberships.map((m) => (
        <div key={m.organizationId} className="flex items-center justify-between rounded border p-2">
          <div>
            <div className="text-sm font-medium">{m.organizationName}</div>
            <div className="text-xs text-muted-foreground">{m.role}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await removeMemberAction(m.organizationId, userPublicId);
                router.refresh();
              });
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await addMemberAction(orgId, userPublicId, "admin");
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            setOrgId("");
            router.refresh();
          });
        }}
      >
        <Input placeholder="Organization ID" value={orgId} onChange={(e) => setOrgId(e.target.value)} />
        <Button type="submit" disabled={pending || !orgId}>
          Add
        </Button>
      </form>
    </div>
  );
}
