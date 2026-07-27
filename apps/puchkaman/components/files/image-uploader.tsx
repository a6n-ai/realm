"use client";

import { useRef, useState, type DragEvent } from "react";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
import { Button } from "@realm/ui/button";
import { cn } from "@realm/ui/cn";
import { apiFetch } from "@/lib/http/api-fetch";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

// No crop-before-upload step (puchkaman doesn't carry the react-easy-crop
// dependency tiffin-grab uses) — files upload directly on selection.
export function ImageUploader({
  value,
  onChange,
  prefix,
  disabled,
}: {
  value: FileDetail | null;
  onChange: (v: FileDetail | null) => void;
  prefix?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      setError("Only PNG, JPEG, WebP or GIF images are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (prefix) body.set("prefix", prefix);
      onChange(await apiFetch<FileDetail>("/api/files/upload", { method: "POST", body }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void upload(file);
  }

  if (value?.url) {
    return (
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value.url}
          alt={value.fileName ?? "image"}
          className="size-16 rounded-md border object-cover"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled}
          onClick={() => onChange(null)}
        >
          <XIcon className="size-3.5" />
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "bg-muted/30 flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dragOver && "border-primary bg-primary/5",
          (disabled || busy) && "pointer-events-none opacity-60",
        )}
      >
        {busy ? (
          <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
        ) : (
          <UploadIcon className="text-muted-foreground size-5" />
        )}
        <p className="text-sm font-medium">
          {busy ? "Uploading…" : "Drop an image or click to upload"}
        </p>
        <Button type="button" variant="outline" size="sm" className="pointer-events-none">
          Choose image
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
          className="sr-only"
        />
      </div>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
