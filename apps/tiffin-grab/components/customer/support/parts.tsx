"use client";

import Link from "next/link";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Button, type Tone } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import type { TicketStatus } from "@/lib/services/tickets.service";

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Your reply needed",
  resolved: "Resolved",
  closed: "Closed",
};

export const STATUS_TONE: Record<TicketStatus, Tone> = {
  open: "up",
  in_progress: "up",
  waiting_on_customer: "hold",
  resolved: "ok",
  closed: "neutral",
};

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={cn(FONT, FOCUS, "mb-2 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-[var(--muted-foreground)] lg:hidden")}>
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </Link>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(FONT, FOCUS, "inline-flex min-h-[44px] select-none items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[var(--primary)] bg-[var(--primary)] px-4 text-[15px] font-semibold text-[var(--primary-foreground,#fff)] [touch-action:manipulation] active:scale-[.97] motion-reduce:active:scale-100")}
    >
      {children}
    </Link>
  );
}

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
      <input ref={inputRef} id={id} type="file" accept={ACCEPT.join(",")} multiple className="sr-only" onChange={(e) => onAdd(e.target.files)} />
      <Button variant="quiet" className="w-full justify-start sm:w-auto" disabled={disabled || full} onClick={() => inputRef.current?.click()}>
        <ImagePlus aria-hidden className="size-4" />
        {full ? "Limit reached" : label}
      </Button>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className={cn(FONT, "flex min-h-11 max-w-full items-center gap-1 rounded-full bg-[var(--muted)] pl-4 pr-1 text-[13px] font-medium")}>
              <span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} disabled={disabled} onClick={() => onRemove(i)} className={cn(FOCUS, "grid size-9 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] [touch-action:manipulation] active:bg-[var(--border)]")}>
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
