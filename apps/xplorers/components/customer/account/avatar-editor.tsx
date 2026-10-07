"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { Area, CropperProps } from "react-easy-crop";
import { ResponsiveDialog } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { getCroppedBlob } from "@/lib/images/crop";
import { removeMyAvatar, updateMyAvatar } from "@/app/(customer)/me/account/avatar-actions";

// react-easy-crop's default export is a class with `defaultProps`; next/dynamic's
// return type drops the JSX LibraryManagedAttributes optionality, so reproduce it.
type CropperType = (typeof import("react-easy-crop"))["default"];
const Cropper = dynamic(() => import("react-easy-crop"), {
  ssr: false,
}) as ComponentType<React.JSX.LibraryManagedAttributes<CropperType, CropperProps>>;

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function initials(name: string | null) {
  const w = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return w.length ? w.slice(0, 2).map((x) => x[0]!.toUpperCase()).join("") : "U";
}

export function AvatarEditor({ image, name }: { image: string | null; name: string | null }) {
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

  function save() {
    if (!src || !area) return;
    void run(async () => {
      const fd = new FormData();
      fd.append("file", await getCroppedBlob(src, area), "avatar.webp");
      return updateMyAvatar(fd);
    }, () => setSrc(null));
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- file URL from our store
        <img src={image} alt="" className="border-border size-20 rounded-full border object-cover" />
      ) : (
        <span
          aria-hidden
          className="bg-secondary text-secondary-foreground grid size-20 place-items-center rounded-full text-2xl font-bold"
        >
          {initials(name)}
        </span>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
          {image ? "Change photo" : "Add photo"}
        </Button>
        {image ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending && !src}
            onClick={() => void run(() => removeMyAvatar())}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={pick}
        aria-label="Photo file"
      />
      {error && !src ? (
        <p className="text-destructive basis-full text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <ResponsiveDialog
        open={src !== null}
        onOpenChange={(o) => {
          if (!o) setSrc(null);
        }}
        title="Crop photo"
        direction="bottom"
        footer={
          <Button type="button" disabled={pending || !area} onClick={save} className="w-full">
            {pending ? "Saving…" : "Save photo"}
          </Button>
        }
      >
        {src ? (
          <div className="space-y-4">
            <div className="bg-muted relative h-72 w-full overflow-hidden rounded-3xl">
              <Cropper
                image={src}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onComplete}
              />
            </div>
            <label className="block text-sm font-semibold">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="accent-primary mt-2 w-full"
              />
            </label>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </ResponsiveDialog>
    </div>
  );
}
