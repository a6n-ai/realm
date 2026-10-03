"use client";

import { useTransition } from "react";
import { CalendarCheck, LinkIcon, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { RowActionButton, RowActions } from "@/components/ds";
import { promptReloadIfStale } from "@/components/stale-deploy-reloader";
import { copyCustomerInviteLink, resendCustomerInvite, sendCustomerMenuReminder } from "./actions";

/** Email the welcome sign-in link, or copy that same link to share over WhatsApp. */
export function useCustomerInvite(email: string | null) {
  const [pending, start] = useTransition();

  function send() {
    if (!email || pending) return;
    start(async () => {
      try {
        await resendCustomerInvite(email);
        toast.success("Invite sent", {
          description: `They'll get a welcome email at ${email} with a sign-in link. If it doesn't arrive, ask them to check spam.`,
        });
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

function MenuReminderButton({ publicId }: { publicId: string }) {
  const [pending, start] = useTransition();
  return (
    <RowActionButton
      icon={CalendarCheck}
      label="Send menu reminder"
      onClick={() => {
        if (pending) return;
        start(async () => {
          const r = await sendCustomerMenuReminder(publicId).catch((e: unknown) => {
            if (!promptReloadIfStale(e)) toast.error("Could not send the reminder.");
            return null;
          });
          if (!r) return;
          if ("error" in r) toast.error(r.error);
          else if (r.queued === 0) toast.warning("Not sent", { description: "This address is unsubscribed or bouncing." });
          else toast.success("Menu reminder sent", { description: "They'll get a link to pick this week's meals." });
        });
      }}
    />
  );
}

// Invite actions hide once they've used the account (verified email). The menu
// reminder shows only for a running plan — nobody else has meals to pick.
export function CustomerInviteCell({
  publicId,
  email,
  joined,
  hasActivePlan,
}: {
  publicId: string;
  email: string | null;
  joined: boolean;
  hasActivePlan: boolean;
}) {
  const { send, copy } = useCustomerInvite(email);
  if (!email) return <span className="text-muted-foreground">—</span>;
  if (joined && !hasActivePlan) return <span className="text-muted-foreground text-xs">Joined</span>;
  return (
    <RowActions>
      {hasActivePlan && <MenuReminderButton publicId={publicId} />}
      {!joined && <RowActionButton icon={SendHorizonal} label="Email invite" onClick={send} />}
      {!joined && <RowActionButton icon={LinkIcon} label="Copy invite link" onClick={copy} />}
    </RowActions>
  );
}
