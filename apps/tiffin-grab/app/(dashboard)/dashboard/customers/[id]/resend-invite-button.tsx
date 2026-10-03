"use client";

import { LinkIcon, MailPlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { useCustomerInvite } from "../customer-invite-cell";
import { useResubscribeLink } from "../../notifications/resubscribe-link-button";

// Staff-only: mail the customer the welcome sign-in link again, or copy that
// same link to share over WhatsApp. Also a re-subscribe link for a customer who
// unsubscribed from marketing mail and wants it back.
export function ResendInviteButton({ email }: { email: string | null }) {
  const { send, copy, pending } = useCustomerInvite(email);
  const resubscribe = useResubscribeLink(email ?? "");
  if (!email) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={resubscribe.pending} onClick={resubscribe.copy}>
        <MailPlusIcon data-icon="inline-start" />
        Copy re-subscribe link
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={copy}>
        <LinkIcon data-icon="inline-start" />
        Copy invite link
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={send}>
        Resend invite
      </Button>
    </div>
  );
}
