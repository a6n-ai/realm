"use client";

import { useTransition } from "react";
import { SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { resendCustomerInvite } from "./actions";

// Same account-setup mail as the customer detail "Resend invite" button:
// a link to choose their own password. Hidden once a credential exists.
export function CustomerInviteCell({ email, hasPassword }: { email: string | null; hasPassword: boolean }) {
  const [pending, start] = useTransition();
  if (!email) return <span className="text-muted-foreground">—</span>;
  if (hasPassword) return <span className="text-muted-foreground text-xs">Joined</span>;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await resendCustomerInvite(email);
            toast.success("Invite sent", { description: `They'll get a link at ${email} to set a password.` });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not send the invite.");
          }
        })
      }
    >
      <SendHorizonal className="size-3.5" />
      Invite
    </Button>
  );
}
