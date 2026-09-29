"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ForgotPasswordForm } from "@foundry/auth-ui";
import { authClient } from "@/lib/auth/client";
import { Card, CardContent } from "@foundry/ui/card";
import { AuthBrandPanel } from "../auth-brand-panel";

export function ForgotForm() {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            <ForgotPasswordForm
              onSendEmailOtp={(email) => authClient.emailOtp.requestPasswordReset({ email })}
              onResetWithEmailOtp={({ email, otp, password }) =>
                authClient.emailOtp.resetPassword({ email, otp, password })
              }
              onSuccess={() => router.push("/login")}
            />
            <div className="mt-6 text-center text-sm">
              <Link href="/login" className="underline underline-offset-4">
                Back to sign in
              </Link>
            </div>
          </div>
          <AuthBrandPanel />
        </CardContent>
      </Card>
      <div className="text-muted-foreground hover:[&_a]:text-primary text-balance text-center text-xs [&_a]:underline [&_a]:underline-offset-4">
        By continuing, you agree to our <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}
