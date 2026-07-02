"use client";

import { useState } from "react";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import type { FileDetail } from "@tiffin/commons-files/model";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@/components/ui/file-upload";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

export function ImageUploadField({
  value,
  onChange,
  disabled,
  prefix,
}: {
  value: FileDetail | null;
  onChange: (v: FileDetail | null) => void;
  disabled?: boolean;
  prefix?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // diceui's onUpload signature is (files, { onProgress, onSuccess, onError }) =>
  // Promise<void>, not the bare (files: File[]) => void from the brief's sketch.
  // We report success/error back through those callbacks so diceui's internal
  // file-state tracking stays consistent, even though this wrapper doesn't
  // render FileUploadList/FileUploadItem.
  async function upload(
    file: File,
    { onSuccess, onError }: { onSuccess: (file: File) => void; onError: (file: File, error: Error) => void },
  ) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      const err = new Error("Only PNG, JPEG, WebP or GIF images are allowed");
      setError(err.message);
      onError(file, err);
      return;
    }
    if (file.size > MAX_BYTES) {
      const err = new Error("Image must be 5 MB or smaller");
      setError(err.message);
      onError(file, err);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (prefix) body.set("prefix", prefix);
      const res = await fetch("/api/files/upload", { method: "POST", body });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Upload failed");
      }
      onChange((await res.json()) as FileDetail);
      onSuccess(file);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Upload failed");
      setError(err.message);
      onError(file, err);
    } finally {
      setBusy(false);
    }
  }

  if (value?.url) {
    return (
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value.url} alt={value.fileName ?? "image"} className="h-16 w-16 rounded-md border object-cover" />
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null)}>
          <XIcon className="size-4" /> Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <FileUpload
        accept={ACCEPT.join(",")}
        maxSize={MAX_BYTES}
        disabled={disabled || busy}
        multiple={false}
        onUpload={async (files, options) => {
          const file = files[0];
          if (file) await upload(file, options);
        }}
      >
        <FileUploadDropzone className={cn("border-dashed", busy && "opacity-60")}>
          <div className="flex flex-col items-center gap-2 p-4 text-sm text-muted-foreground">
            {busy ? <Loader2Icon className="size-5 animate-spin" /> : <UploadIcon className="size-5" />}
            <span>{busy ? "Uploading…" : "Drop an image or click to upload"}</span>
          </div>
          <FileUploadTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy}>
              Choose image
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
