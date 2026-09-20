"use client";
import { useState, useTransition } from "react";
import { Switch } from "@foundry/ui/switch";
import { saveSendLoad } from "./actions";

export function SendLoadToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">Send tiffin count as load</h2>
        <p className="text-muted-foreground text-sm">
          Adds load1 (tiffins on the stop) to every push. Leave off unless load/capacity is enabled on
          the OptimoRoute account; the account is shared with another business.
        </p>
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Send tiffin count as load"
        onCheckedChange={(next) => {
          setOn(next);
          start(async () => {
            try {
              await saveSendLoad(next);
            } catch {
              setOn(!next);
            }
          });
        }}
      />
    </div>
  );
}
