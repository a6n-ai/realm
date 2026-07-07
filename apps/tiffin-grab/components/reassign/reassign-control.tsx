"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";

export function ReassignControl({
  currentOwnerId,
  currentOwnerName,
  staff,
  action,
}: {
  currentOwnerId: string | null;
  currentOwnerName: string | null;
  staff: { publicId: string; name: string }[];
  action: (ownerId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Select
      value={currentOwnerId ?? undefined}
      disabled={pending}
      onValueChange={(v) =>
        start(async () => {
          await action(v);
          router.refresh();
          toast("Owner updated");
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
