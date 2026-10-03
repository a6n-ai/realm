"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AUTH_LINK, AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { AuthLogo } from "@/components/auth/auth-kit";
import { IOS_BUTTON } from "@/components/customer/ios-button";

/**
 * Email can't run JS, so the OTP email's "Copy code" links here. The code rides
 * in the URL fragment, which browsers never send to the server, so it stays out
 * of access logs and link-scanner requests.
 */
export function CopyCode() {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCode(window.location.hash.slice(1).replace(/\D/g, "").slice(0, 8));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code is user-select:all, so a tap still selects it.
    }
  }

  return (
    <AuthScreen>
      <AuthPanel
        art={<AuthLogo />}
        title={code ? "Your sign-in code" : "No code here"}
        tagline={code ? "Paste it back where you asked for it. It expires in 10 minutes." : "Open the code from your latest Tiffin Grab email."}
      >
        <div className="flex flex-1 flex-col gap-5">
          {code ? <p className="select-all text-[40px] font-semibold tracking-[0.3em] tabular-nums">{code}</p> : null}
          <div className="mt-auto flex flex-col gap-3 pt-4 sm:mt-2">
            {code ? (
              <Button className={IOS_BUTTON} onClick={copy}>
                {copied ? "Copied" : "Copy code"}
              </Button>
            ) : null}
            <div className="flex flex-col items-center">
              <Link href="/login" className={`${AUTH_LINK} inline-flex items-center`}>Back to sign in</Link>
            </div>
          </div>
        </div>
      </AuthPanel>
    </AuthScreen>
  );
}
