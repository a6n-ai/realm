"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { resendCustomerInvite } from "../actions";

// Staff-only: mail the customer the welcome sign-in link again. Nothing is
// shown to the admin — the link goes to the customer's inbox.
export function ResendInviteButton({ email }: { email: string | null }) {
  const [pending, start] = useTransition();
  if (!email) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await resendCustomerInvite(email);
            toast.success("Invite sent", { description: `They'll get a welcome email at ${email} with a sign-in link.` });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send the invite.");
          }
        })
      }
    >
      Resend invite
    </Button>
  );
}
