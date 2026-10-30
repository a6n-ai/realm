"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Download, Link2, Mail, MessageSquare, Send, Ticket } from "lucide-react";
import { Button, Card, IconTile, buttonClass, type IconTint } from "@/components/customer/kit";
import { referCardPath, referPath, shareMessage } from "@/lib/referrals/share";

/** WhatsApp's glyph (Simple Icons, CC0); lucide ships no brand icons. */
function WhatsAppGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

// WhatsApp's brand green with dark text, as whatsapp.com does: white on #25D366 fails contrast.
const WHATSAPP = "!border-transparent !bg-[#25D366] !text-[#0B141A] hover:!bg-[#1EBE5A]";

/** The app's theme as the CSS sees it: the `dark` class on <html>, kept live. Not @foundry/themes'
 *  useTheme: two copies of that package are installed, and this client chunk gets the one whose
 *  context the root ThemeProvider never fills, so it always says light. */
function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => watch.disconnect();
  }, []);
  return dark;
}

/** One app in the share row: a tinted tile over its name, like the iOS share sheet. */
function Target({ tint, icon, label, href, onClick, download }: { tint: IconTint; icon: ReactNode; label: string; href?: string; onClick?: () => void; download?: string }) {
  const body = (
    <>
      <IconTile tint={tint} size="lg">{icon}</IconTile>
      <span className="c-caption w-full text-center text-[12px] leading-tight text-balance">{label}</span>
    </>
  );
  const cls = "flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-1 transition-colors hover:bg-[color-mix(in_oklch,var(--foreground)_6%,transparent)]";
  return href ? (
    <a href={href} download={download} target={download ? undefined : "_blank"} rel="noopener noreferrer" className={cls}>{body}</a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>{body}</button>
  );
}

export function ShareCard({ code, offer = null }: { code: string; offer?: string | null }) {
  // The card follows the app theme: what they see here is what they save and send.
  const image = referCardPath(code, { theme: useDarkMode() ? "dark" : "light" });
  const [link, setLink] = useState(referPath(code));
  const [file, setFile] = useState<File | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  // Origin and file sharing exist only in the browser; render the relative link until then.
  useEffect(() => {
    setLink(window.location.origin + referPath(code));
    // Fetched ahead: Safari drops the tap's permission to share if we await a download first.
    let live = true;
    fetch(image)
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
  }, [code, image]);

  const text = shareMessage(code, link, offer);
  const enc = encodeURIComponent;

  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText({ link, code }[what]);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked: the code and link are on screen to copy by hand */
    }
  };

  // Image + caption in one share. WhatsApp keeps the caption on Android but can drop it
  // on iOS, so the message is copied first to paste in. Not awaited: Safari only allows
  // share() inside the tap, and waiting on the clipboard can spend that permission.
  // No title or url alongside files: some targets then drop the file or the text.
  const shareWithImage = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    navigator.share({ files: [file!], text }).catch((e: unknown) => {
      // A target refusing files: send the text, whose link previews as the card anyway.
      if (e instanceof DOMException && e.name !== "AbortError") navigator.share({ text }).catch(() => {});
    });
  };
  const waText = `https://wa.me/?text=${enc(text)}`;

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

      {/* What the WhatsApp share sends; the /r link previews as the landscape version of this card. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- generated per code; next/image's localPatterns fence /api/files only */}
      <img src={image} alt={`TiffinGrab promo card with code ${code}`} width={1080} height={1350} loading="lazy" className="mx-auto aspect-[4/5] h-auto w-full max-w-[280px] rounded-2xl bg-[color-mix(in_oklch,var(--foreground)_7%,transparent)] shadow-sm" />

      {file ? (
        <Button variant="primary" className={`w-full ${WHATSAPP}`} onClick={shareWithImage}>
          <WhatsAppGlyph />
          Share on WhatsApp
        </Button>
      ) : (
        // No file sharing here (most desktops): text with the link, which WhatsApp previews as the card.
        <a href={waText} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "primary", className: `w-full ${WHATSAPP}` })}>
          <WhatsAppGlyph />
          Share on WhatsApp
        </a>
      )}

      <div className="grid grid-cols-5 gap-1">
        <Target tint="blue" icon={<Download />} label="Save image" href={image} download={`tiffingrab-${code}.png`} />
        <Target tint="green" icon={<MessageSquare />} label="Messages" href={`sms:?&body=${enc(text)}`} />
        <Target tint="orange" icon={<Mail />} label="Email" href={`mailto:?subject=${enc("A tiffin treat from a friend")}&body=${enc(text)}`} />
        <Target tint="cyan" icon={<Send />} label="Telegram" href={`https://t.me/share/url?url=${enc(link)}&text=${enc(text.slice(0, text.lastIndexOf("\n")))}`} />
        <Target tint="gray" icon={copied === "link" ? <Check /> : <Link2 />} label={copied === "link" ? "Copied" : "Copy link"} onClick={() => copy("link")} />
      </div>
    </Card>
  );
}
