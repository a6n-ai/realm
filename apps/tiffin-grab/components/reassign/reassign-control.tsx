"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/action-result";
import { unwrapAction } from "@/lib/actions/unwrap";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@foundry/ui/select";

export function ReassignControl({
  currentOwnerId,
  currentOwnerName,
  staff,
  action,
}: {
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  staff: { publicId: string; name: string }[];
  action: (ownerId: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Select
      value={currentOwnerId ?? undefined}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          try {
            await unwrapAction(action(v));
            router.refresh();
            toast("Owner updated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update owner");
          }
        })
      }
    >
      <SelectTrigger className="w-44">
        <SelectValue>{currentOwnerName ?? "Unassigned"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {staff.map((s) => <SelectItem key={s.publicId} value={s.publicId}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
