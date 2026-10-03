"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@foundry/ui/button";

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

  if (!code) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">No code here.</h1>
        <p className="text-muted-foreground text-sm">Open the code from your latest Tiffin Grab email.</p>
        <Link href="/login" className="text-primary text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <h1 className="text-xl font-semibold">Your Tiffin Grab code</h1>
      <p className="select-all text-4xl font-bold tracking-[0.3em] tabular-nums">{code}</p>
      <Button size="lg" className="w-full" onClick={copy}>
        {copied ? "Copied" : "Copy code"}
      </Button>
      <p className="text-muted-foreground text-sm">Paste it back where you asked for it. It expires in 10 minutes.</p>
    </div>
  );
}
