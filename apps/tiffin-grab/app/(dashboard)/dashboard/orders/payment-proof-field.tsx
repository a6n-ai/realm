"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";

export type PaymentProofValue = { file: File | null; reference: string };

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

/** e-Transfer screenshot staff attach while creating the order (shown under the "Already paid" toggle). */
export function PaymentProofField({
  value,
  onChange,
}: {
  value: PaymentProofValue;
  onChange: (next: PaymentProofValue) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (value.file ? URL.createObjectURL(value.file) : null), [value.file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pick(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return setError("Use a PNG, JPEG, WebP or GIF image.");
    if (file.size > MAX_BYTES) return setError("Screenshot must be 5 MB or smaller.");
    setError(null);
    onChange({ ...value, file });
  }

  return (
    <div className="space-y-3 text-sm">

      {value.file && preview ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Payment screenshot" className="size-16 rounded-md border object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{value.file.name}</p>
            <p className="text-muted-foreground text-xs">Will be approved on create</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove screenshot"
            onClick={() => onChange({ ...value, file: null })}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <ImageIcon data-icon="inline-start" />
          Attach screenshot
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-destructive text-xs" role="alert">{error}</p> : null}

      {value.file ? (
        <div className="grid gap-1.5">
          <Label htmlFor="proof-reference" className="text-muted-foreground text-xs">
            Transfer reference (optional)
          </Label>
          <Input
            id="proof-reference"
            value={value.reference}
            onChange={(e) => onChange({ ...value, reference: e.target.value })}
            placeholder="e.g. CA1x2y3z"
          />
        </div>
      ) : null}
    </div>
  );
}
