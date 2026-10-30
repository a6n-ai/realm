"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Download, Link2, Mail, MessageCircle, MessageSquare, Send, Share2, Ticket } from "lucide-react";
import { Button, Card, IconTile, buttonClass, type IconTint } from "@/components/customer/kit";
import { referCardPath, shareMessage } from "@/lib/referrals/share";

/** One app in the share row: a tinted tile over its name, like the iOS share sheet. */
function Target({ tint, icon, label, href, onClick, download }: { tint: IconTint; icon: ReactNode; label: string; href?: string; onClick?: () => void; download?: string }) {
  const body = (
    <>
      <IconTile tint={tint} size="lg">{icon}</IconTile>
      <span className="c-caption text-[12px]">{label}</span>
    </>
  );
  const cls = "flex flex-col items-center gap-1.5 rounded-xl py-1 transition-colors hover:bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]";
  return href ? (
    <a href={href} download={download} target={download ? undefined : "_blank"} rel="noopener noreferrer" className={cls}>{body}</a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}

export function ShareCard({ code, offer = null }: { code: string; offer?: string | null }) {
  const image = referCardPath(code);
  const [link, setLink] = useState(`/subscribe?ref=${code}`);
  const [canShare, setCanShare] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  // Origin and Web Share exist only in the browser; render the relative link until then.
  useEffect(() => {
    setLink(`${window.location.origin}/subscribe?ref=${code}`);
    setCanShare(typeof navigator.share === "function");
    // Fetched ahead: Safari drops the tap's permission to share if we await a download first.
    let live = true;
    fetch(referCardPath(code))
      .then((r) => (r.ok ? r.blob() : Promise.reject()))
      .then((b) => {
        const f = new File([b], `tiffingrab-${code}.png`, { type: "image/png" });
        if (live && navigator.canShare?.({ files: [f] })) setFile(f);
      })
      .catch(() => {
        /* no image: share sends the text and link, whose preview still shows the card */
      });
    return () => {
      live = false;
    };
  }, [code]);

  const text = shareMessage(code, link, offer);
  const enc = encodeURIComponent;

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
    navigator.share(file ? { files: [file], text } : { text }).catch((e: unknown) => {
      // Some targets refuse files; retry as text. AbortError is the sheet being dismissed.
      if (file && e instanceof DOMException && e.name !== "AbortError") navigator.share({ text }).catch(() => {});
    });

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3">
        <IconTile tint="purple" size="lg"><Ticket /></IconTile>
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

      {/* What friends get with "With image"; links preview as the landscape version of the same card. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- generated per code; next/image's localPatterns fence /api/files only */}
      <img src={image} alt={`TiffinGrab promo card with code ${code}`} width={1080} height={1350} loading="lazy" className="mx-auto aspect-[4/5] h-auto w-full max-w-[280px] rounded-2xl bg-[color-mix(in_oklch,var(--foreground)_7%,transparent)] shadow-sm" />
      <p className="c-caption truncate text-center">{link}</p>

      <a href={`https://wa.me/?text=${enc(text)}`} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "primary", className: "w-full" })}>
        <MessageCircle aria-hidden className="size-4" />
        Share on WhatsApp
      </a>

      <div className="grid grid-cols-5 gap-1">
        {canShare ? (
          <Target tint="blue" icon={<Share2 />} label={file ? "With image" : "More"} onClick={share} />
        ) : (
          <Target tint="blue" icon={<Download />} label="Save image" href={image} download={`tiffingrab-${code}.png`} />
        )}
        <Target tint="green" icon={<MessageSquare />} label="Messages" href={`sms:?&body=${enc(text)}`} />
        <Target tint="orange" icon={<Mail />} label="Email" href={`mailto:?subject=${enc("A tiffin treat from a friend")}&body=${enc(text)}`} />
        <Target tint="cyan" icon={<Send />} label="Telegram" href={`https://t.me/share/url?url=${enc(link)}&text=${enc(text.slice(0, text.lastIndexOf("\n")))}`} />
        <Target tint="gray" icon={copied === "link" ? <Check /> : <Link2 />} label={copied === "link" ? "Copied" : "Copy link"} onClick={() => copy("link")} />
      </div>
    </Card>
  );
}
