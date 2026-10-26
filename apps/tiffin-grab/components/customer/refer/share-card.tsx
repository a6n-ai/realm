"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2, Ticket } from "lucide-react";
import { Button, Card, IconTile } from "@/components/customer/kit";

export function ShareCard({ code }: { code: string }) {
  const [link, setLink] = useState(`/subscribe?ref=${code}`);
  const [canShare, setCanShare] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  // Origin and Web Share exist only in the browser; render the relative link until then.
  useEffect(() => {
    setLink(`${window.location.origin}/subscribe?ref=${code}`);
    setCanShare(typeof navigator.share === "function");
  }, [code]);

  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked: the code and link are on screen to copy by hand */
    }
  };

  const share = () =>
    navigator.share({ text: `Get tiffins from TiffinGrab with my code ${code}: ${link}` }).catch(() => {
      /* share sheet dismissed */
    });

  // A pass, like Apple Wallet: the code is the hero with its own Copy code; the link and its actions sit under it.
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <IconTile tint="orange" size="lg"><Ticket /></IconTile>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">Your referral code</p>
          <p className="c-caption">Share it with friends</p>
        </div>
      </div>
      <div className="rounded-2xl bg-[color-mix(in_oklch,var(--foreground)_7%,transparent)] px-4 py-4 text-center">
        <p className="font-mono text-[32px] leading-none font-bold tracking-[0.3em] [padding-left:0.3em]">{code}</p>
        <Button variant="quiet" size="md" className="mt-3 !min-h-9 !px-3.5 !text-[13px]" onClick={() => copy("code")} aria-label={`Copy code ${code}`}>
          {copied === "code" ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
          <span role="status">{copied === "code" ? "Code copied" : "Copy code"}</span>
        </Button>
      </div>
      <p className="c-caption truncate text-center">{link}</p>
      <div className={canShare ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
        <Button variant="primary" onClick={() => copy("link")}>
          {copied === "link" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied === "link" ? "Copied" : "Copy link"}
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
