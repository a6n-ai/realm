"use client";

import Link from "next/link";
import { CheckIcon, CopyIcon } from "lucide-react";
import { OTP_TTL_MINUTES } from "@foundry/commons";
import { AUTH_LINK, AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { AuthLogo } from "@/components/auth/auth-kit";
import { IOS_BUTTON } from "@/components/kit/ios-button";
import { useCopy } from "@/lib/hooks/use-copy";

/**
 * Email can't run JS, so the code email's "Copy code" button links here.
 * `code` is null when the link is forged, damaged or older than the code lifetime.
 */
export function CopyCode({ code }: { code: string | null }) {
  const { copied, copy: copyText } = useCopy();
  const copy = () => copyText(code!);

  return (
    <AuthScreen>
      <AuthPanel
        art={<AuthLogo />}
        title={code ? "Use this code to continue" : "This link has expired"}
        tagline={
          code
            ? `Enter it where you first tried to sign in. It expires in ${OTP_TTL_MINUTES} minutes.`
            : `Codes last ${OTP_TTL_MINUTES} minutes. Ask for a new one where you're signing in.`
        }
      >
        <div className="flex flex-1 flex-col gap-5">
          {code ? (
            <p className="border-border bg-card select-all self-center rounded-2xl border px-6 py-4 text-[40px] font-semibold tracking-[0.2em] tabular-nums">
              {code}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 pt-1">
            {code ? (
              // Thumb-sized and full width on phones; a compact centered pill on desktop.
              <Button
                className={`${IOS_BUTTON} sm:h-10 sm:min-h-10 sm:w-auto sm:self-center sm:px-5 sm:!text-subhead`}
                onClick={copy}
              >
                {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
                {copied ? "Copied" : "Copy code"}
              </Button>
            ) : null}
            <div className="flex flex-col items-center">
              <Link href="/login" className={`${AUTH_LINK} inline-flex items-center`}>
                {code ? "Sign in here instead" : "Back to sign in"}
              </Link>
            </div>
          </div>
        </div>
      </AuthPanel>
    </AuthScreen>
  );
}
