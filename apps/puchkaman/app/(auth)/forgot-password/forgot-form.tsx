"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ForgotPasswordForm } from "@realm/auth-ui";
import { Card, CardContent } from "@realm/ui/card";
import { authClient } from "@/lib/auth/client";

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
          <div className="relative hidden flex-col items-center justify-center gap-2 border-l border-[var(--green)] bg-[var(--yellow)] p-8 text-[var(--ink)] md:flex">
            <span className="text-2xl font-bold text-[var(--red)]">Puchkaman</span>
            <p className="text-balance text-center text-sm opacity-80">Operations console for staff.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
