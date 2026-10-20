"use client";

import { useTransition } from "react";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { copyWeekAction } from "./session-actions";

export function CopyWeekButton({ fromMonday, toMonday }: { fromMonday: string; toMonday: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await copyWeekAction(fromMonday, toMonday);
          if (res.error) toast.error(res.error);
          else toast.success(`Copied ${res.copied} session${res.copied === 1 ? "" : "s"} into this week`);
        })
      }
    >
      <CopyIcon />
      Copy last week
    </Button>
  );
}
