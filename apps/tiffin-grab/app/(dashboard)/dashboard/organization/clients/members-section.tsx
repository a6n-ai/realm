"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { addMemberAction, removeMemberAction } from "@/lib/services/organizations-actions";
import type { MemberRow } from "@/lib/services/organizations.service";

export function MembersSection({ organizationId, members }: { organizationId: string; members: MemberRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");

  return (
    <div className="space-y-3">
      {members.map((m) => (
        <div key={m.userId} className="flex items-center justify-between rounded border p-2">
          <div>
            <div className="text-sm font-medium">{m.email}</div>
            <div className="text-xs text-muted-foreground">{m.role}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await removeMemberAction(organizationId, m.userId);
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
            const result = await addMemberAction(organizationId, email, "admin");
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            setEmail("");
            router.refresh();
          });
        }}
      >
        <Input placeholder="User public ID (usr_…)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={pending || !email}>
          Add
        </Button>
      </form>
    </div>
  );
}
