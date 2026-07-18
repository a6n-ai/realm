"use client";

import { useRef, useState, type DragEvent } from "react";
import { Loader2Icon, UploadIcon, XIcon } from "lucide-react";
import type { FileDetail } from "@realm/storage/model";
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
      <div className="flex center" style={{ gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value.url}
          alt={value.fileName ?? "image"}
          style={{ width: 64, height: 64, borderRadius: "var(--r-sm)", border: "var(--border)", objectFit: "cover" }}
        />
        <button type="button" className="btn btn--white btn--sm" disabled={disabled} onClick={() => onChange(null)}>
          <XIcon size={14} /> Remove
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div
        className="ph"
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          cursor: disabled || busy ? "default" : "pointer",
          minHeight: 140,
          flexDirection: "column",
          gap: 10,
          opacity: busy ? 0.6 : 1,
          borderColor: dragOver ? "var(--red)" : undefined,
        }}
      >
        {busy ? <Loader2Icon size={22} className="admin-spin" /> : <UploadIcon size={22} />}
        <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{busy ? "Uploading…" : "Drop an image or click to upload"}</span>
        <span className="btn btn--white btn--sm" style={{ pointerEvents: "none" }}>
          Choose image
        </span>
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
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />
      </div>
      {error && <span className="err-msg">{error}</span>}
    </div>
  );
}
