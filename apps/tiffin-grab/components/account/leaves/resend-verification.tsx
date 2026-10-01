"use client";

import { authClient } from "@/lib/auth/client";
import { Button } from "@foundry/ui/button";
import { toast } from "sonner";

export function ResendVerification({ email }: { email: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const { error } = await authClient.sendVerificationEmail({
          email,
          callbackURL: `${window.location.origin}/verify-email`,
        });
        if (error) {
          toast.error("Failed to send verification email.");
        } else {
          toast.success("Verification email sent", { description: "Check your inbox, and your spam folder if it isn't there." });
        }
      }}
    >
      Resend verification email
    </Button>
  );
}
