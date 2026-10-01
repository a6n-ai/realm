"use client";

import { useTransition } from "react";
import { LinkIcon, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { RowActionButton, RowActions } from "@/components/ds";
import { promptReloadIfStale } from "@/components/stale-deploy-reloader";
import { copyCustomerInviteLink, resendCustomerInvite } from "./actions";

/** Email the welcome sign-in link, or copy that same link to share over WhatsApp. */
export function useCustomerInvite(email: string | null) {
  const [pending, start] = useTransition();

  function send() {
    if (!email || pending) return;
    start(async () => {
      try {
        await resendCustomerInvite(email);
        toast.success("Invite sent", { description: `They'll get a welcome email at ${email} with a sign-in link.` });
      } catch (e) {
        if (!promptReloadIfStale(e)) toast.error(e instanceof Error ? e.message : "Could not send the invite.");
      }
    });
  }

  function copy() {
    if (!email || pending) return;
    start(async () => {
      let url: string;
      try {
        url = await copyCustomerInviteLink(email);
      } catch (e) {
        if (!promptReloadIfStale(e)) toast.error(e instanceof Error ? e.message : "Could not create the invite link.");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invite link copied", { description: "Signs them in once, valid for 7 days." });
      } catch {
        // Clipboard can refuse after the await (lost user gesture) — show it to copy by hand.
        toast("Invite link", { description: url, duration: 30_000 });
      }
    });
  }

  return { send, copy, pending };
}

// Hidden once they've used the account (verified email).
export function CustomerInviteCell({ email, joined }: { email: string | null; joined: boolean }) {
  const { send, copy } = useCustomerInvite(email);
  if (!email) return <span className="text-muted-foreground">—</span>;
  if (joined) return <span className="text-muted-foreground text-xs">Joined</span>;
  return (
    <RowActions>
      <RowActionButton icon={SendHorizonal} label="Email invite" onClick={send} />
      <RowActionButton icon={LinkIcon} label="Copy invite link" onClick={copy} />
    </RowActions>
  );
}
