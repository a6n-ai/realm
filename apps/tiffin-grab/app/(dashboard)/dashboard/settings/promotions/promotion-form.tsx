"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { SectionCard } from "@/components/ds";
import { ImageUploader } from "@/components/files";
import { DateTimeInput } from "@/components/dashboard/date-fields";
import { EmailContentEditor, type EmailContentEditorHandle } from "@relay/engine/ui/email-content-editor";
import { fromLocalInput, toLocalInput } from "@/lib/dates/local-input";
import { savePromotionAction, type PromotionInput } from "./actions";
import { PromotionPreview } from "./promotion-preview";

const PLACEMENTS = [
  { value: "sticker", label: "Hero sticker", hint: "A round sticker on the home page video: the short headline and the offer text." },
  { value: "popup", label: "Popup", hint: "Opens once per visitor on the home page. Highest priority wins if several are on." },
  { value: "section", label: "Landing section", hint: "A slide in the home page offers carousel. Every live one shows, highest priority first." },
] as const;

const NO_COUPON = "__none__";

export interface PromotionFormValues {
  publicId: string;
  title: string;
  blurb: string;
  badge: string;
  body: string;
  html: string;
  /** Prefill for the editor when nothing is saved; saved only once staff change it. */
  starterHtml: string;
  imageUrl: string;
  couponCode: string;
  ctaLabel: string;
  ctaHref: string;
  placements: string[];
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  priority: number;
}

export function PromotionForm({
  initial,
  coupons,
  timezone,
}: {
  initial: PromotionFormValues | null;
  coupons: { code: string; name: string; badge: string }[];
  timezone: string;
}) {
  const router = useRouter();
  const editor = useRef<EmailContentEditorHandle>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [blurb, setBlurb] = useState(initial?.blurb ?? "");
  const [badge, setBadge] = useState(initial?.badge ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [couponCode, setCouponCode] = useState(initial?.couponCode ?? "");
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? "Claim offer");
  const [ctaHref, setCtaHref] = useState(initial?.ctaHref ?? "");
  const [placements, setPlacements] = useState<string[]>(initial?.placements ?? ["sticker"]);
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null, timezone));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null, timezone));
  const [active, setActive] = useState(initial?.active ?? true);
  const [priority, setPriority] = useState(String(initial?.priority ?? 0));
  const [previewHtml, setPreviewHtml] = useState(initial?.html ?? "");
  const [refreshing, startRefresh] = useTransition();
  const starter = initial?.starterHtml ?? "";
  const couponBadge = coupons.find((c) => c.code === couponCode)?.badge ?? "";

  // An untouched starter is the built-in card, so it stays unsaved: the card keeps following the fields.
  const exportBody = async () => {
    const out = await editor.current?.exportEmail();
    return out && starter && out.body === starter ? { body: "", html: "" } : out;
  };

  const refreshPreview = () =>
    startRefresh(async () => {
      const out = await exportBody().catch(() => null);
      if (out) setPreviewHtml(out.html);
    });

  const togglePlacement = (value: string, on: boolean) =>
    setPlacements((cur) => (on ? [...cur, value] : cur.filter((p) => p !== value)));

  const save = () =>
    start(async () => {
      setError(null);
      const out = await exportBody();
      if (out) setPreviewHtml(out.html);
      const res = await savePromotionAction(initial?.publicId ?? null, {
        title,
        blurb,
        badge,
        body: out?.body ?? null,
        html: out?.html ?? null,
        imageUrl,
        couponCode,
        ctaLabel,
        ctaHref,
        placements: placements as PromotionInput["placements"],
        startsAt: fromLocalInput(startsAt, timezone),
        endsAt: fromLocalInput(endsAt, timezone),
        active,
        priority: Number.parseInt(priority, 10) || 0,
      }).catch(() => ({ error: "Could not save. Try again." }));
      if ("error" in res) return setError(res.error);
      toast.success(res.message ?? "Promotion saved");
      if (!initial) router.replace(`/dashboard/settings/promotions/${res.publicId}`);
      else router.refresh();
    });

  return (
    <div className="grid gap-6">
      <SectionCard title="Basics">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="prm-title">Title</Label>
            <Input id="prm-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prm-blurb">One-line blurb</Label>
            <Input id="prm-blurb" value={blurb} maxLength={160} placeholder="Shown on the coupon and in the popup" onChange={(e) => setBlurb(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prm-badge">Headline</Label>
            <Input id="prm-badge" value={badge} maxLength={24} placeholder={couponBadge ? `Default: ${couponBadge} (from coupon)` : "Default: the title"} onChange={(e) => setBadge(e.target.value)} />
            <p className="text-muted-foreground text-xs">Big text in the middle of the hero sticker and on the offer card, like &quot;$65 off&quot;.</p>
          </div>
          <div className="grid gap-2">
            <Label>Image</Label>
            <ImageUploader
              prefix="promotions"
              value={imageUrl ? { name: "promotion", fileName: "promotion", isDirectory: false, size: 0, filePath: imageUrl, url: imageUrl } : null}
              onChange={(f) => setImageUrl(f?.url ?? "")}
            />
            <p className="text-muted-foreground text-xs">Shown beside the coupon, on phones above it, and at the top of the popup. Without one, the thali photo is used.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prm-priority">Priority</Label>
            <Input id="prm-priority" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-32" />
            <p className="text-muted-foreground text-xs">Higher wins when several promotions share a place.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Where it shows">
        <div className="grid gap-3">
          {PLACEMENTS.map((p) => (
            <div key={p.value} className="flex items-center justify-between gap-4">
              <div className="grid gap-0.5">
                <Label htmlFor={`prm-pl-${p.value}`}>{p.label}</Label>
                <p className="text-muted-foreground text-xs">{p.hint}</p>
              </div>
              <Switch id={`prm-pl-${p.value}`} checked={placements.includes(p.value)} onCheckedChange={(on) => togglePlacement(p.value, on)} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Offer and button">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="prm-coupon">Linked coupon</Label>
            <Select value={couponCode || NO_COUPON} onValueChange={(v) => setCouponCode(v === NO_COUPON ? "" : v)}>
              <SelectTrigger id="prm-coupon"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COUPON}>No coupon</SelectItem>
                {coupons.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} · {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prm-cta">Button label</Label>
            <Input id="prm-cta" value={ctaLabel} maxLength={40} onChange={(e) => setCtaLabel(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prm-href">Button link</Label>
            <Input id="prm-href" value={ctaHref} placeholder={couponCode ? "Default: subscribe with the coupon" : "Default: /subscribe"} onChange={(e) => setCtaHref(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Schedule">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="prm-start">Starts</Label>
            <DateTimeInput id="prm-start" value={startsAt} onChange={setStartsAt} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prm-end">Ends</Label>
            <DateTimeInput id="prm-end" value={endsAt} onChange={setEndsAt} />
          </div>
          <div className="flex items-end gap-3 pb-2">
            <Switch id="prm-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="prm-active">Switched on</Label>
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">Times are in the app timezone ({timezone}). Leave both empty to run until switched off.</p>
      </SectionCard>

      <SectionCard title="Card content (popup and landing section)">
        <EmailContentEditor
          ref={editor}
          initialBody={initial?.body || starter}
          initialHtml={initial?.html || starter}
          variables={[]}
        />
        <p className="text-muted-foreground mt-3 text-xs">Saved HTML replaces the card&apos;s headline, title and blurb; the button and code stay. Leave it unchanged to keep the built-in card. Sanitized before it reaches the public site.</p>
      </SectionCard>

      <SectionCard
        title="Preview"
        subtitle="How it looks on the home page. Placement switches above decide where it actually shows."
        action={<Button variant="outline" size="sm" disabled={refreshing} onClick={refreshPreview}>{refreshing ? "Updating…" : "Update body"}</Button>}
      >
        <PromotionPreview
          promo={{
            id: initial?.publicId ?? "preview",
            title: title.trim() || "Your offer title",
            blurb: blurb.trim() || null,
            html: previewHtml.trim() ? previewHtml : null,
            imageUrl: imageUrl.trim() || null,
            badge: badge.trim() || couponBadge || null,
            code: couponCode || null,
            href: ctaHref || "/subscribe",
            cta: ctaLabel.trim() || "Claim offer",
          }}
        />
      </SectionCard>

      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild><Link href="/dashboard/settings/promotions">Back to list</Link></Button>
        <Button disabled={pending || !title.trim()} onClick={save}>{pending ? "Saving…" : "Save promotion"}</Button>
      </div>
    </div>
  );
}
