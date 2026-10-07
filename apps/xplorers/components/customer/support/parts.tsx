"use client";

import { ImagePlusIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@foundry/ui/button";
import type { TicketStatus } from "@/lib/services/tickets.service";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on you",
  resolved: "Resolved",
  closed: "Closed",
};

export const STATUS_TONE: Record<TicketStatus, "default" | "secondary" | "outline" | "destructive"> = {
  open: "default",
  in_progress: "secondary",
  waiting_on_customer: "outline",
  resolved: "secondary",
  closed: "outline",
};

export const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 4;

export function useImageFiles(onError: (msg: string | null) => void) {
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  function add(picked: FileList | null) {
    if (!picked) return;
    onError(null);
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (next.length >= MAX_FILES) {
        onError(`Attach up to ${MAX_FILES} images`);
        break;
      }
      if (!ACCEPT.includes(f.type)) {
        onError("Only PNG, JPEG, WebP or GIF images are allowed");
        continue;
      }
      if (f.size > MAX_BYTES) {
        onError("Each image must be 5 MB or smaller");
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }
  return { files, setFiles, inputRef, add };
}

export function PhotoPicker({
  id,
  files,
  inputRef,
  onAdd,
  onRemove,
  disabled,
  label = "Add photos",
}: {
  id?: string;
  files: File[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAdd: (l: FileList | null) => void;
  onRemove: (i: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  const full = files.length >= MAX_FILES;
  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT.join(",")}
        multiple
        className="sr-only"
        onChange={(e) => onAdd(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start sm:w-auto"
        disabled={disabled || full}
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlusIcon data-icon="inline-start" />
        {full ? "Limit reached" : label}
      </Button>
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="bg-muted flex min-h-11 max-w-full items-center gap-1 rounded-full pr-1 pl-4 text-sm font-medium"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                disabled={disabled}
                onClick={() => onRemove(i)}
                className="text-muted-foreground hover:bg-background grid size-9 shrink-0 place-items-center rounded-full"
              >
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
