"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setSlotEnabled } from "./actions";

export function SlotToggle({ id, label, enabled }: { id: string; label: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <label className="flex items-center gap-3">
      <Switch
        checked={enabled}
        onCheckedChange={(checked) =>
          start(async () => {
            await setSlotEnabled(id, checked);
            router.refresh();
          })
        }
        disabled={pending}
      />
      <span className="text-sm font-medium">{label}</span>
    </label>
  );
}
