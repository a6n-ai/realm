"use client";

import { useTransition } from "react";
import { CalendarCheck, LinkIcon, SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { RowActions } from "@/components/ds";
import { RowActionTooltipButton } from "@/components/ds/row-action-tooltip-button";
import { promptReloadIfStale } from "@/components/stale-deploy-reloader";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import type { SendState } from "@/lib/services/customers.service";
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

/**
 * Status tone for a send: green opened, yellow sent but not opened, red never
 * sent or failed. Informational only — the button always stays clickable, so
 * staff can resend to someone who opened but still hasn't acted.
 */
export function sendTone(state: SendState | null, fmt: (ms: number) => string): { tone: string; status: string } {
  if (!state) return { tone: "text-bad", status: "Not sent yet" };
  if (state.status === "failed") return { tone: "text-bad", status: `Last send failed (${fmt(state.at)})` };
  if (state.openedAt) return { tone: "text-ok", status: `Opened ${fmt(state.openedAt)}` };
  if (state.deliveredAt) return { tone: "text-warn", status: `Delivered ${fmt(state.deliveredAt)}, not opened yet` };
  return { tone: "text-warn", status: `Sent ${fmt(state.at)}, not opened yet` };
}

function MenuReminderButton({ publicId, state }: { publicId: string; state: SendState | null }) {
  const [pending, start] = useTransition();
  const tz = useTimezone();
  const { tone, status } = sendTone(state, (ms) => formatEpoch(ms, { mode: "datetime", timeZone: tz }));
  return (
    <RowActionTooltipButton
      icon={CalendarCheck}
      label="Send menu reminder"
      hint={`Send menu reminder · ${status}`}
      tone={tone}
      disabled={pending}
      onClick={() => {
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
  lastInvite,
  lastReminder,
}: {
  publicId: string;
  email: string | null;
  joined: boolean;
  hasActivePlan: boolean;
  lastInvite: SendState | null;
  lastReminder: SendState | null;
}) {
  const { send, copy, pending } = useCustomerInvite(email);
  const tz = useTimezone();
  if (!email) return <span className="text-muted-foreground">—</span>;
  if (joined && !hasActivePlan) return <span className="text-muted-foreground text-xs">Joined</span>;
  const invite = sendTone(lastInvite, (ms) => formatEpoch(ms, { mode: "datetime", timeZone: tz }));
  return (
    <RowActions>
      {hasActivePlan && <MenuReminderButton publicId={publicId} state={lastReminder} />}
      {!joined && (
        <RowActionTooltipButton
          icon={SendHorizonal}
          label="Email invite"
          hint={`Email invite · ${invite.status}`}
          tone={invite.tone}
          disabled={pending}
          onClick={send}
        />
      )}
      {!joined && <RowActionTooltipButton icon={LinkIcon} label="Copy invite link" disabled={pending} onClick={copy} />}
    </RowActions>
  );
}
