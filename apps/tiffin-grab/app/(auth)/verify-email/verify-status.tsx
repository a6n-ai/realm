"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export function VerifyStatus() {
  const params = useSearchParams();
  const error = params.get("error");

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Verification link is invalid or expired.</h1>
        <p className="text-muted-foreground text-sm">
          The link may have already been used or has expired. You can request a new one from your account page.
        </p>
        <Link href="/dashboard" className="text-primary underline underline-offset-4 text-sm">
          Go to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h1 className="text-xl font-semibold">Your email is verified.</h1>
      <p className="text-muted-foreground text-sm">
        Your email address has been successfully verified.
      </p>
      <Link href="/dashboard" className="text-primary underline underline-offset-4 text-sm">
        Go to dashboard
      </Link>
    </div>
  );
}
