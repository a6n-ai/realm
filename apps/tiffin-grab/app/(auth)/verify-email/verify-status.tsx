"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { AuthLogo } from "@/components/auth/auth-kit";
import { IOS_BUTTON } from "@/components/customer/ios-button";

export function VerifyStatus() {
  const failed = Boolean(useSearchParams().get("error"));

  return (
    <AuthScreen>
      <AuthPanel
        art={<AuthLogo />}
        title={failed ? "This link has expired" : "Your email is verified"}
        tagline={
          failed
            ? "It may already have been used. Sign in and we'll send you a fresh one."
            : "You're all set. Continue to your account."
        }
      >
        <div className="pt-1">
          <Button asChild className={IOS_BUTTON}>
            <Link href={failed ? "/login" : "/dashboard"}>{failed ? "Go to sign in" : "Continue"}</Link>
          </Button>
        </div>
      </AuthPanel>
    </AuthScreen>
  );
}
