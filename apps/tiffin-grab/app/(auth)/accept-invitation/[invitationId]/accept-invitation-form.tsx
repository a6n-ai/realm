"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CodeOtp, AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { authClient } from "@/lib/auth/client";
import { Button } from "@foundry/ui/button";
import { IOS_BUTTON } from "@/components/customer/ios-button";
import { AuthLegal, AuthLogo, IOS_INPUT } from "@/components/auth/auth-kit";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { acceptInvitationAction } from "../actions";

export function AcceptInvitationForm({
  invitationId,
  initialError = null,
}: {
  invitationId: string;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function onSendCode() {
    setError(null);
    setSending(true);
    try {
      await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      setSent(true);
    } catch {
      setError("Could not send the code. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function onVerify() {
    setError(null);
    setVerifying(true);
    try {
      const result = await acceptInvitationAction({ invitationId, email, otp });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Fresh session, no password yet — /set-password already gates on exactly
      // that (session present, passwordSet false) and finishes the flow.
      router.push("/set-password");
    } catch {
      setError("That code doesn't match or has expired. Check the latest email, or send a new code.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AuthScreen footer={<AuthLegal />}>
      <AuthPanel
        art={<AuthLogo />}
        title={sent ? "Enter the code" : "Accept your invitation"}
        tagline={sent ? "If this email has an invitation, we've sent it a 6-digit code." : "Verify your email to join and finish setting up your account."}
      >
        <div className="flex flex-1 flex-col gap-5">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              className={IOS_INPUT}
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sent}
              placeholder="you@example.com"
            />
          </div>
          {sent ? (
            <div className="grid gap-2">
              <Label>Verification code</Label>
              <CodeOtp value={otp} onChange={setOtp} onComplete={onVerify} aria-label="Verification code" />
            </div>
          ) : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <div className="pt-1">
            {sent ? (
              <Button type="button" className={IOS_BUTTON} disabled={verifying || otp.length !== 6} onClick={onVerify}>
                {verifying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Verify & accept"}
              </Button>
            ) : (
              <Button type="button" className={IOS_BUTTON} disabled={sending || !email} onClick={onSendCode}>
                {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Send code"}
              </Button>
            )}
          </div>
        </div>
      </AuthPanel>
    </AuthScreen>
  );
}
