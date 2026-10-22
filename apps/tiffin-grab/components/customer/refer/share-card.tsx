"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { Button, Card } from "@/components/customer/kit";

export function ShareCard({ code }: { code: string }) {
  const [link, setLink] = useState(`/subscribe?ref=${code}`);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState(false);

  // Origin and Web Share exist only in the browser; render the relative link until then.
  useEffect(() => {
    setLink(`${window.location.origin}/subscribe?ref=${code}`);
    setCanShare(typeof navigator.share === "function");
  }, [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is on screen to copy by hand */
    }
  };

  const share = () =>
    navigator.share({ text: `Get tiffins from TiffinGrab with my code ${code}: ${link}` }).catch(() => {
      /* share sheet dismissed */
    });

  return (
    <Card className="space-y-4 p-5">
      <div>
        <p className="c-label">Your referral code</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-[0.2em]">{code}</p>
        <p className="c-caption mt-1 [overflow-wrap:anywhere]">{link}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={copy}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
        {canShare ? (
          <Button variant="outline" onClick={share}>
            <Share2 aria-hidden className="size-4" />
            Share
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
