"use client";

import { useState } from "react";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@foundry/ui/file-upload";
import { MAX_CLASS_PHOTOS } from "@/lib/sessions/photos";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function ClassPhotosField({
  value,
  disabled,
}: {
  value: string[];
  disabled?: boolean;
}) {
  const [photos, setPhotos] = useState<string[]>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = MAX_CLASS_PHOTOS - photos.length;

  async function upload(
    files: File[],
    options: {
      onSuccess: (file: File) => void;
      onError: (file: File, error: Error) => void;
    },
  ) {
    if (disabled) return;
    setError(null);
    const take = files.slice(0, Math.max(0, remaining));
    if (take.length === 0) {
      const err = new Error(`Up to ${MAX_CLASS_PHOTOS} photos per class.`);
      setError(err.message);
      for (const file of files) options.onError(file, err);
      return;
    }
    setBusy(true);
    try {
      const next = [...photos];
      for (const file of take) {
        try {
          const body = new FormData();
          body.set("file", file);
          body.set("prefix", "classes");
          const res = await fetch("/api/files/upload", { method: "POST", body });
          if (!res.ok) {
            const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
            throw new Error(problem.detail ?? problem.title ?? "Upload failed");
          }
          const detail = (await res.json()) as { url?: string };
          if (!detail.url) throw new Error("Upload failed");
          if (!next.includes(detail.url)) next.push(detail.url);
          options.onSuccess(file);
        } catch (err) {
          const caught = err instanceof Error ? err : new Error("Upload failed");
          setError(caught.message);
          options.onError(file, caught);
        }
      }
      for (const file of files.slice(take.length)) {
        options.onError(file, new Error(`Up to ${MAX_CLASS_PHOTOS} photos per class.`));
      }
      setPhotos(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Photos</p>
      <p className="text-muted-foreground text-sm">A few shots of the class. Shown on the public calendar.</p>
      {photos.map((url) => (
        <input key={url} type="hidden" name="photos" value={url} />
      ))}
      {photos.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <li key={url} className="relative size-20 overflow-hidden rounded-md border">
              {/* Class photos are uploaded files, not the static marketing set. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="size-full object-cover" />
              {disabled ? null : (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute top-1 right-1 size-6"
                  onClick={() => setPhotos(photos.filter((item) => item !== url))}
                  aria-label="Remove photo"
                >
                  <XIcon className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {disabled || remaining <= 0 ? null : (
        <FileUpload
          accept={ACCEPT}
          maxSize={5 * 1024 * 1024}
          multiple
          disabled={busy}
          onUpload={async (files, options) => {
            await upload(files, options);
          }}
        >
          <FileUploadDropzone className="border-dashed">
            <div className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-sm">
              {busy ? <Loader2Icon className="size-5 animate-spin" /> : <UploadIcon className="size-5" />}
              <span>{busy ? "Uploading…" : "Drop photos or click to add"}</span>
            </div>
            <FileUploadTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={busy}>
                Add photos
              </Button>
            </FileUploadTrigger>
          </FileUploadDropzone>
        </FileUpload>
      )}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
