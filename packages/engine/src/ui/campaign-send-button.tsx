"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import {
  ResponsiveDialog,
} from "@foundry/design-system";
import { apiFetch } from "@relay/engine/ui";

/**
 * A send is irreversible, so it goes through an explicit confirmation that
 * shows the count the admin is approving — and that count is sent back to the
 * server, which reports a mismatch rather than quietly mailing a different set.
 */
export function CampaignSendButton({
  campaignPublicId,
  count,
}: {
  campaignPublicId: string;
  count: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const res = await apiFetch<{ queued: number; warning?: string }>(
        `/api/notifications/campaigns/${campaignPublicId}/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmedCount: count }),
        },
      );
      if (res.warning) toast.warning(res.warning);
      else toast.success(`Queued ${res.queued} messages`);
      setOpen(false);
      router.refresh();
    } catch {
      // apiFetch already toasted the failure detail.
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Send now</Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Send this campaign?"
        description={`${count} recipients will be queued. This cannot be undone.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending ? "Queueing…" : `Send to ${count}`}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
