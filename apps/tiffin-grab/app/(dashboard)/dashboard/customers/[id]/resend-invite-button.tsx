"use client";

import { LinkIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { useCustomerInvite } from "../customer-invite-cell";

// Staff-only: mail the customer the welcome sign-in link again, or copy that
// same link to share over WhatsApp.
export function ResendInviteButton({ email }: { email: string | null }) {
  const { send, copy, pending } = useCustomerInvite(email);
  if (!email) return null;
  return (
    <div className="flex gap-2">
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
