"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { CodeOtp } from "@foundry/auth-ui";
import { authClient } from "@/lib/auth/client";
import { Button } from "@foundry/ui/button";
import { Card, CardContent } from "@foundry/ui/card";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { acceptInvitationAction } from "../actions";

export function AcceptInvitationForm({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await acceptInvitationAction({ invitationId, email, otp });
      // Fresh session, no password yet — /set-password already gates on exactly
      // that (session present, passwordSet false) and finishes the flow.
      router.push("/set-password");
    } catch {
      setError("Invalid or expired code.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid gap-4 p-6 md:p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Accept your invitation</h1>
            <p className="text-muted-foreground text-sm">
              Verify your email to join and finish setting up your account.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
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
          {sent ? (
            <Button type="button" className="w-full" disabled={verifying || otp.length !== 6} onClick={onVerify}>
              {verifying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Verify & accept"}
            </Button>
          ) : (
            <Button type="button" className="w-full" disabled={sending || !email} onClick={onSendCode}>
              {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Send code"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
