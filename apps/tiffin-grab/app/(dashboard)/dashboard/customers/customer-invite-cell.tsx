"use client";

import { useTransition } from "react";
import { SendHorizonal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { resendCustomerInvite } from "./actions";

// Same welcome mail as the customer detail "Resend invite" button: a link that
// signs them in. Hidden once they've used the account (verified email).
export function CustomerInviteCell({ email, joined }: { email: string | null; joined: boolean }) {
  const [pending, start] = useTransition();
  if (!email) return <span className="text-muted-foreground">—</span>;
  if (joined) return <span className="text-muted-foreground text-xs">Joined</span>;
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
      <SendHorizonal className="size-3.5" />
      Invite
    </Button>
  );
}
