"use client";

import { useRef, useState } from "react";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
import { Button } from "@realm/ui/button";
import { FileUpload, FileUploadDropzone, FileUploadTrigger } from "@realm/ui/file-upload";
import { cn } from "@realm/ui/cn";
import { apiFetch } from "@/lib/http/api-fetch";
import { ImageCropperDialog } from "./image-cropper-dialog";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

type DiceOptions = {
  onSuccess: (file: File) => void;
  onError: (file: File, error: Error) => void;
};

export function ImageUploader({
  value,
  onChange,
  edit = true,
  prefix,
  disabled,
  shape = "square",
}: {
  value: FileDetail | null;
  onChange: (v: FileDetail | null) => void;
  edit?: boolean;
  prefix?: string;
  disabled?: boolean;
  shape?: "square" | "round";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropName, setCropName] = useState("image");
  const pending = useRef<{ file: File; options: DiceOptions } | null>(null);

  async function upload(file: File, options: DiceOptions) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      const e = new Error("Only PNG, JPEG, WebP or GIF images are allowed");
      setError(e.message);
      options.onError(file, e);
      return;
    }
    if (file.size > MAX_BYTES) {
      const e = new Error("Image must be 5 MB or smaller");
      setError(e.message);
      options.onError(file, e);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (prefix) body.set("prefix", prefix);
      // apiFetch toasts the problem+json detail on failure and throws; the catch
      // below still mirrors it into the field's inline error + onError callback.
      onChange(await apiFetch<FileDetail>("/api/files/upload", { method: "POST", body }));
      options.onSuccess(file);
    } catch (e) {
      const err = e instanceof Error ? e : new Error("Upload failed");
      setError(err.message);
      options.onError(file, err);
    } finally {
      setBusy(false);
    }
  }

  function onSelected(file: File, options: DiceOptions) {
    if (!edit) {
      void upload(file, options);
      return;
    }
    // Pre-validate type before opening the editor (size is re-checked on upload).
    if (!ACCEPT.includes(file.type)) {
      const e = new Error("Only PNG, JPEG, WebP or GIF images are allowed");
      setError(e.message);
      options.onError(file, e);
      return;
    }
    pending.current = { file, options };
    setCropName(file.name.replace(/\.[^.]+$/, "") || "image");
    setCropSrc(URL.createObjectURL(file));
  }

  function closeCropper() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    pending.current = null;
  }

  async function onCropApply(file: File) {
    const p = pending.current;
    closeCropper();
    if (p) await upload(file, p.options);
  }

  function onCropCancel() {
    // Clear diceui's pending file state so the dropzone resets.
    if (pending.current) {
      pending.current.options.onError(pending.current.file, new Error("cancelled"));
    }
    closeCropper();
  }

  if (value?.url) {
    return (
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value.url}
          alt={value.fileName ?? "image"}
          className={cn("size-16 border object-cover", shape === "round" ? "rounded-full" : "rounded-md")}
        />
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
          if (file) onSelected(file, options);
        }}
      >
        <FileUploadDropzone className={cn("border-dashed", busy && "opacity-60")}>
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-sm">
            {busy ? <Loader2Icon className="size-5 animate-spin" /> : <UploadIcon className="size-5" />}
            <span>{busy ? "Uploading…" : edit ? "Drop an image to edit & upload" : "Drop an image or click to upload"}</span>
          </div>
          <FileUploadTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={disabled || busy}>
              Choose image
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>
      </FileUpload>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {cropSrc ? (
        <ImageCropperDialog open src={cropSrc} fileName={cropName} onCancel={onCropCancel} onApply={onCropApply} />
      ) : null}
    </div>
  );
}
