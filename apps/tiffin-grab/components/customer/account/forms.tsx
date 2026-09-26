"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition, type ComponentType, type FormEvent, type ReactNode } from "react";
import type { Area, CropperProps } from "react-easy-crop";
import { Button, Card, Field, ListGroup, ListRow, Notice, Pill, Sheet, Textarea, Toggle } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { getCroppedBlob } from "@/lib/images/crop";
import {
  updateMyContact,
  updateMyPreferences,
  updateMyProfile,
} from "@/app/(dashboard)/dashboard/account/actions";
import { removeMyAvatar, updateMyAvatar } from "@/app/(dashboard)/dashboard/account/avatar-actions";
import { ChangeEmailForm } from "@/components/account/leaves/change-email-form";
import { ChangePasswordForm } from "@/components/account/leaves/change-password-form";
import { DeleteAccountForm } from "@/components/account/leaves/delete-account-form";
import { PinForm } from "@foundry/auth-ui";
import { setMyPin, removeMyPin } from "@/app/(dashboard)/dashboard/account/actions";
import { kitAuthUi } from "./auth-ui-kit";

type CropperType = (typeof import("react-easy-crop"))["default"];
const Cropper = dynamic(() => import("react-easy-crop"), { ssr: false }) as ComponentType<
  React.JSX.LibraryManagedAttributes<CropperType, CropperProps>
>;

type Status = { kind: "ok" | "error"; text: string } | null;

/** Runs a save, reports the outcome inline (no toasts), refreshes server data. */
function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  const run = (fn: () => Promise<unknown>, ok: string, onOk?: () => void) =>
    start(async () => {
      try {
        await fn();
        setStatus({ kind: "ok", text: ok });
        onOk?.();
        router.refresh();
      } catch (e) {
        setStatus({ kind: "error", text: e instanceof Error ? e.message : "Could not save. Try again." });
      }
    });
  return { pending, status, run, clear: () => setStatus(null) };
}

function SaveBar({ pending, dirty, status, label = "Save" }: { pending: boolean; dirty: boolean; status: Status; label?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button type="submit" variant="primary" size="lg" pending={pending} disabledReason={dirty ? undefined : "Nothing to save yet."} className="w-full sm:w-auto sm:min-w-40">
        {pending ? "Saving" : label}
      </Button>
      {status && <Notice tone={status.kind === "error" ? "error" : "info"}>{status.text}</Notice>}
    </div>
  );
}

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="space-y-5 p-5 md:p-6">
      <header className="space-y-1">
        <h2 className="c-h2">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--muted-foreground)]">{subtitle}</p>}
      </header>
      {children}
    </Card>
  );
}

function submit(fn: () => void) {
  return (e: FormEvent) => {
    e.preventDefault();
    fn();
  };
}

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function initials(name: string | null) {
  const w = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return w.length ? w.slice(0, 2).map((x) => x[0].toUpperCase()).join("") : "U";
}

function AvatarEditor({ image, name }: { image: string | null; name: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) return setError("Choose a PNG, JPEG, or WebP image.");
    if (file.size > MAX_BYTES) return setError("Image must be 2 MB or smaller.");
    const r = new FileReader();
    r.onload = () => {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setArea(null);
      setSrc(r.result as string);
    };
    r.readAsDataURL(file);
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) {
    setPending(true);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else {
        done?.();
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  const save = () =>
    src && area
      ? run(async () => {
          const fd = new FormData();
          fd.append("file", await getCroppedBlob(src, area), "avatar.webp");
          return updateMyAvatar(fd) as Promise<{ ok: boolean; error?: string }>;
        }, () => setSrc(null))
      : undefined;

  return (
    <div className="flex items-center gap-4">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- secured file URL carries a per-request token
        <img src={image} alt="" className="size-20 rounded-full border border-[var(--border)] object-cover" />
      ) : (
        <span aria-hidden className="grid size-20 place-items-center rounded-full bg-[var(--primary-wash,#FBE3D2)] text-2xl font-bold text-[#B5430B] dark:text-[#FFB877]">
          {initials(name)}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" onClick={() => input.current?.click()}>
          {image ? "Change photo" : "Add photo"}
        </Button>
        {image && (
          <Button variant="quiet" pending={pending && !src} onClick={() => run(() => removeMyAvatar() as Promise<{ ok: boolean; error?: string }>)}>
            Remove
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept={ACCEPTED.join(",")} className="hidden" onChange={pick} aria-label="Photo file" />
      {error && !src && <Notice tone="error" className="basis-full">{error}</Notice>}
      <Sheet
        open={src !== null}
        onClose={() => setSrc(null)}
        title="Crop photo"
        footer={
          <Button variant="primary" size="lg" pending={pending} onClick={save} className="w-full">
            Save photo
          </Button>
        }
      >
        {src && (
          <div className="space-y-4">
            <div className="relative h-72 w-full overflow-hidden rounded-3xl bg-[var(--muted)]">
              <Cropper image={src} crop={crop} zoom={zoom} aspect={1} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete} />
            </div>
            <label className="block text-sm font-semibold">
              Zoom
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="mt-2 w-full accent-[var(--primary)]" />
            </label>
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

export function ProfileForm({ image, name, username }: { image: string | null; name: string; username: string }) {
  const [v, setV] = useState({ name, username });
  const [saved, setSaved] = useState({ name, username });
  const [err, setErr] = useState<{ name?: string; username?: string }>({});
  const s = useSave();
  const dirty = v.name !== saved.name || v.username !== saved.username;

  function go() {
    const e: typeof err = {};
    if (v.name.length > 120) e.name = "Name is too long.";
    if (v.username && !/^[a-zA-Z0-9_.]{3,30}$/.test(v.username)) e.username = "3 to 30 characters: letters, numbers, _ or .";
    setErr(e);
    if (e.name || e.username) return;
    s.run(() => updateMyProfile(v), "Profile saved.", () => setSaved(v));
  }

  return (
    <Block title="Profile" subtitle="Your photo, display name, and username.">
      <AvatarEditor image={image} name={name || null} />
      <form onSubmit={submit(go)} className="grid max-w-md gap-4" noValidate>
        <Field label="Name" value={v.name} error={err.name} autoComplete="name" onChange={(e) => setV({ ...v, name: e.target.value })} />
        <Field label="Username (optional)" value={v.username} error={err.username} autoComplete="username" placeholder="e.g. priya.sharma" onChange={(e) => setV({ ...v, username: e.target.value })} />
        <SaveBar pending={s.pending} dirty={dirty} status={s.status} label="Save profile" />
      </form>
    </Block>
  );
}

export function ContactForm({ phone, email, emailVerified, phoneVerified }: { phone: string; email: string; emailVerified: boolean; phoneVerified: boolean }) {
  const [v, setV] = useState(phone);
  const [saved, setSaved] = useState(phone);
  const s = useSave();
  return (
    <Block title="Phone" subtitle="We text you when your tiffin is out for delivery.">
      <form onSubmit={submit(() => s.run(() => updateMyContact({ phone: v }), "Phone saved.", () => setSaved(v)))} className="grid max-w-md gap-4">
        <Field label="Phone number" type="tel" inputMode="tel" autoComplete="tel" value={v} onChange={(e) => setV(e.target.value)} hint={phone ? (phoneVerified ? "Verified" : "Not verified yet") : undefined} />
        <SaveBar pending={s.pending} dirty={v !== saved} status={s.status} label="Save phone" />
      </form>
      <ListGroup>
        <ListRow label="Email" sublabel="Change it under Security" value={<Pill tone={emailVerified ? "ok" : "neutral"}>{emailVerified ? "Verified" : "Unverified"}</Pill>} />
        <ListRow label={email} />
      </ListGroup>
    </Block>
  );
}

const ALLERGENS = ["Peanuts", "Tree nuts", "Dairy", "Eggs", "Gluten", "Soy", "Shellfish", "Fish", "Sesame"];

export function DietaryForm({ allergens, dietaryNotes }: { allergens: string[]; dietaryNotes: string }) {
  const [picked, setPicked] = useState(allergens);
  const [notes, setNotes] = useState(dietaryNotes);
  const [saved, setSaved] = useState({ picked: allergens, notes: dietaryNotes });
  const s = useSave();
  const dirty = notes !== saved.notes || picked.length !== saved.picked.length || picked.some((a) => !saved.picked.includes(a));
  const toggle = (a: string) => setPicked((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));

  return (
    <Block title="Dietary & allergens" subtitle="Tell the kitchen what to avoid. Allergens are flagged on every order.">
      <form
        onSubmit={submit(() => s.run(() => updateMyPreferences({ allergens: picked, dietaryNotes: notes.trim() }), "Dietary preferences saved.", () => setSaved({ picked, notes: notes.trim() })))}
        className="space-y-5"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Allergens</legend>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => {
              const on = picked.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(a)}
                  className={cn(
                    FONT,
                    FOCUS,
                    "min-h-11 rounded-full border-2 px-4 text-sm font-semibold [touch-action:manipulation] active:scale-[.97]",
                    on ? "border-[var(--primary)] bg-[color-mix(in_oklch,var(--primary)_10%,transparent)]" : "border-[var(--border)] bg-[var(--card)]",
                  )}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Textarea label="Dietary notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Vegetarian, low spice, no onion or garlic." hint="Anything else the kitchen should know." />
        <SaveBar pending={s.pending} dirty={dirty} status={s.status} label="Save preferences" />
      </form>
    </Block>
  );
}

export function DeliveryNotesForm({ deliveryNotes }: { deliveryNotes: string }) {
  const [v, setV] = useState(deliveryNotes);
  const [saved, setSaved] = useState(deliveryNotes);
  const s = useSave();
  return (
    <Block title="Delivery notes" subtitle="Help the driver find you: gate code, drop-off spot, or a nearby landmark.">
      <form onSubmit={submit(() => s.run(() => updateMyPreferences({ deliveryNotes: v.trim() }), "Delivery notes saved.", () => setSaved(v.trim())))} className="space-y-4">
        <Textarea label="Notes for the driver" value={v} maxLength={500} onChange={(e) => setV(e.target.value)} placeholder="e.g. Gate code 1234, leave at the side door." hint="Shown to the driver at drop-off. Avoid sensitive personal info." />
        <SaveBar pending={s.pending} dirty={v !== saved} status={s.status} label="Save notes" />
      </form>
    </Block>
  );
}

export function NotificationsForm({ notifyEmail }: { notifyEmail: boolean }) {
  const [state, setState] = useState({ notifyEmail });
  const s = useSave();
  const set = (patch: Partial<typeof state>) => {
    const prev = state;
    setState({ ...state, ...patch });
    s.run(() => updateMyPreferences({ ...state, ...patch }).catch((e) => { setState(prev); throw e; }), "Saved.");
  };
  return (
    <Block title="Notifications" subtitle="Choose how we reach you about orders and account updates.">
      <ListGroup>
        <ListRow label="Email" sublabel="Confirmations, receipts, important updates" value={<Toggle label="Email notifications" checked={state.notifyEmail} disabled={s.pending} onChange={(v) => set({ notifyEmail: v })} />} />
      </ListGroup>
      {s.status && <Notice tone={s.status.kind === "error" ? "error" : "info"}>{s.status.text}</Notice>}
    </Block>
  );
}

/** Password, email and delete flows are the shared @foundry/auth-ui screens (stock styling, kit cards around them). */
export function SecurityPanel({ email, staffPin }: { email: string | null; staffPin: { hasPin: boolean } | null }) {
  return (
    <div className="space-y-4">
      {staffPin && (
        <Block title="PIN" subtitle="Unlocks the console after idle.">
          <PinForm hasPin={staffPin.hasPin} onSetPin={setMyPin} onRemovePin={removeMyPin} ui={kitAuthUi} />
        </Block>
      )}
      <Block title="Email address" subtitle="Used for sign-in and account notices. We verify your current and new address.">
        <ChangeEmailForm currentEmail={email} ui={kitAuthUi} />
      </Block>
      <Block title="Password" subtitle="Change your password. Other devices are signed out.">
        <ChangePasswordForm ui={kitAuthUi} />
      </Block>
      <Block title="Delete account" subtitle="Permanently close your account. This can't be undone.">
        <DeleteAccountForm ui={kitAuthUi} />
      </Block>
    </div>
  );
}
