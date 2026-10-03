"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AUTH_LINK, AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { Button } from "@foundry/ui/button";
import { AuthLogo } from "@/components/auth/auth-kit";
import { IOS_BUTTON } from "@/components/customer/ios-button";
import { signIn } from "@/lib/auth/client";
import { clearLockSession } from "@/lib/auth/lock-actions";
import { safeCallbackUrl } from "../login/auth-form";
import { clearPendingSignIn, takePendingSignIn } from "./pending-sign-in";

/**
 * Where the code email's button lands. Same browser that asked for the code:
 * sign in straight away. Any other device: show the code to type over there.
 * The code rides in the URL fragment, which browsers never send to the server,
 * so it stays out of access logs and link-scanner requests.
 */
export function CopyCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const value = window.location.hash.slice(1).replace(/\D/g, "").slice(0, 8);
    // Drop the code from the address bar and history.
    if (value) history.replaceState(null, "", window.location.pathname);
    setCode(value);
    const pending = value ? takePendingSignIn() : null;
    if (!pending) return;
    setSigningIn(true);
    signIn
      .emailOtp({ email: pending.email, otp: value })
      .then(async (res) => {
        if (res?.error) throw res.error;
        clearPendingSignIn();
        await clearLockSession();
        router.replace(safeCallbackUrl(pending.callbackUrl) ?? "/dashboard");
        router.refresh();
      })
      // Wrong or stale code (an older email): fall back to showing it.
      .catch(() => setSigningIn(false));
  }, [router]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard blocked: the code is select-all, so a tap still selects it.
    }
  }

  if (signingIn) {
    return (
      <AuthScreen>
        <AuthPanel art={<AuthLogo />} title="Signing you in…" tagline="One moment.">{null}</AuthPanel>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen>
      <AuthPanel
        art={<AuthLogo />}
        title={code ? "Your Tiffin Grab code" : "No code here"}
        tagline={
          code
            ? "Enter it where you asked for it. It expires in 10 minutes."
            : "Open the code from your latest Tiffin Grab email."
        }
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
