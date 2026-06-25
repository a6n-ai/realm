"use client";

import type { ComponentType } from "react";
import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Area, CropperProps } from "react-easy-crop";

// react-easy-crop's default export is a class with `defaultProps`; next/dynamic's
// return type drops the JSX LibraryManagedAttributes optionality, so reproduce it.
type CropperType = (typeof import("react-easy-crop"))["default"];
const Cropper = dynamic(() => import("react-easy-crop"), {
  ssr: false,
}) as ComponentType<React.JSX.LibraryManagedAttributes<CropperType, CropperProps>>;
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCroppedBlob } from "@/lib/images/crop";
import { updateMyAvatar, removeMyAvatar } from "./avatar-actions";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

function initials(name: string | null): string {
  if (!name?.trim()) return "U";
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function AvatarField({
  image,
  name,
}: {
  image: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedArea(croppedAreaPixels);
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("Please select a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 2 MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
      setDialogOpen(true);
    };
    reader.readAsDataURL(file);

    // reset input so re-selecting same file fires again
    e.target.value = "";
  }

  async function handleSave() {
    if (!imageSrc || !croppedArea) return;
    setPending(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedArea);
      const fd = new FormData();
      fd.append("file", blob, "avatar.webp");
      const result = await updateMyAvatar(fd);
      if (!result.ok) {
        setError(result.error);
      } else {
        setDialogOpen(false);
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleRemove() {
    setPending(true);
    setError(null);
    try {
      const result = await removeMyAvatar();
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Avatar size="lg">
        <AvatarImage src={image ?? undefined} alt={name ?? undefined} />
        <AvatarFallback>{initials(name)}</AvatarFallback>
      </Avatar>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          Change photo
        </Button>
        {image && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={handleRemove}
          >
            Remove
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop photo</DialogTitle>
          </DialogHeader>

          {imageSrc && (
            <div className="relative h-64 w-full">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
          )}

          <div className="px-1">
            <label className="text-sm text-muted-foreground">Zoom</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
