"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, CopyIcon } from "lucide-react";
import { AUTH_LINK, AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { AuthLogo } from "@/components/auth/auth-kit";
import { IOS_BUTTON } from "@/components/customer/ios-button";

/**
 * Email can't run JS, so the code email's "Copy code" button links here.
 * `code` is null when the link is forged, damaged or older than 10 minutes.
 */
export function CopyCode({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code is select-all, so a tap still selects it.
    }
  }

  return (
    <AuthScreen>
      <AuthPanel
        art={<AuthLogo />}
        title={code ? "Use this code to continue" : "This link has expired"}
        tagline={
          code
            ? "Enter it where you first tried to sign in. It expires in 10 minutes."
            : "Codes last 10 minutes. Ask for a new one where you're signing in."
        }
      >
        <div className="flex flex-1 flex-col gap-5">
          {code ? (
            <p className="border-border bg-card select-all self-center rounded-2xl border px-6 py-4 text-[40px] font-semibold tracking-[0.2em] tabular-nums">
              {code}
            </p>
          ) : null}
          <div className="mt-auto flex flex-col gap-3 pt-4 sm:mt-2">
            {code ? (
              // Thumb-sized and full width on phones; a compact centered pill on desktop.
              <Button
                className={`${IOS_BUTTON} sm:h-10 sm:min-h-10 sm:w-auto sm:self-center sm:px-5 sm:!text-[15px]`}
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
