"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@foundry/ui/switch";
import { RowActionTooltipButton } from "@/components/ds";
import { setPromotionActiveAction } from "./actions";

/** Row actions on the promotions list: switch it on or off in place, or open it to edit. */
export function PromotionRowActions({ publicId, title, active }: { publicId: string; title: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const toggle = (on: boolean) =>
    start(async () => {
      const res = await setPromotionActiveAction(publicId, on).catch(() => ({ error: "Could not update. Try again." }));
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message ?? (on ? "Promotion switched on" : "Promotion switched off"));
      router.refresh();
    });

  return (
    <div className="flex items-center justify-end gap-2">
      <Switch checked={active} disabled={pending} onCheckedChange={toggle} aria-label={`${active ? "Switch off" : "Switch on"} ${title}`} />
      <RowActionTooltipButton icon={PencilIcon} label={`Edit ${title}`} hint="Edit" onClick={() => router.push(`/dashboard/settings/promotions/${publicId}`)} />
    </div>
  );
}
