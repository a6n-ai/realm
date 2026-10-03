"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { ResponsiveDialog } from "@/components/ds";
import { inviteAllPendingCustomers } from "./actions";

export function InvitePendingButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (count === 0) return null;

  function send() {
    setOpen(false);
    start(async () => {
      const r = await inviteAllPendingCustomers();
      if ("error" in r) return void toast.error(r.error);
      if (r.failed > 0) toast.warning(`Sent ${r.sent} invites, ${r.failed} failed`, { description: "Retry the failed ones from their row." });
      else toast.success(`Sent ${r.sent} invites`);
    });
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size="sm" variant="outline" disabled={pending}>
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
          {pending ? "Sending invites…" : `Invite all pending (${count})`}
        </Button>
      }
      title={`Email ${count} invites?`}
      description="Every customer who hasn't used their account yet gets the welcome email with a sign-in link. This sends now and can take a minute — keep this page open."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Not now
          </Button>
          <Button onClick={send}>Send {count} invites</Button>
        </div>
      }
    >
      <div />
    </ResponsiveDialog>
  );
}
