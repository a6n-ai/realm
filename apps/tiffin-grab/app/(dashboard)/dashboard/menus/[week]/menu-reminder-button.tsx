"use client";

import { useState, useTransition } from "react";
import { MailIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { sendWeekMenuReminder } from "../actions";

export function MenuReminderButton({ weekId }: { weekId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function send() {
    setOpen(false);
    start(async () => {
      const r = await sendWeekMenuReminder(weekId);
      if ("error" in r) return void toast.error(r.error);
      toast.success(r.queued > 0 ? `Reminder queued for ${r.queued} customers` : "Everyone already has this week's reminder", {
        description: "Track it under Notifications → System.",
      });
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="outline" disabled={pending}>
          <MailIcon className="size-4" /> Send reminder
        </Button>
      }
      title="Email the menu reminder?"
      description="Every customer with an active or paused plan gets a link to pick this week's meals. Anyone who already got it for this week is skipped, as are unsubscribed addresses."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button disabled={pending} onClick={send}>
            Send reminder
          </Button>
        </div>
      }
    >
      <div />
    </ResponsiveDialog>
  );
}
