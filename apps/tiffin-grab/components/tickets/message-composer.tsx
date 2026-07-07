"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Textarea } from "@realm/ui/textarea";
import type { RealtimeRole } from "@realm/realtime";
import { useTyping } from "@realm/realtime/client";
import { makeThumbnail } from "@/lib/images/thumbnail";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 4;

export function MessageComposer({
  action,
  closed,
  placeholder = "Write a reply…",
  channel,
  peerRole,
}: {
  action: (form: FormData) => Promise<void>;
  closed: boolean;
  placeholder?: string;
  channel?: string;
  peerRole?: RealtimeRole;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Hooks can't be conditional — call unconditionally with a possibly-empty
  // channel; useChannel no-ops on empty. Gate the UI/side-effects on `channel`.
  const { peerTyping, notifyTyping } = useTyping(channel ?? "", peerRole ?? "staff");

  if (closed) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
        This ticket is closed. Staff can reopen it to continue the conversation.
      </p>
    );
  }

  function addFiles(picked: FileList | null) {
    if (!picked) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (next.length >= MAX_FILES) { setError(`Attach up to ${MAX_FILES} images`); break; }
      if (!ACCEPT.includes(f.type)) { setError("Only PNG, JPEG, WebP or GIF images are allowed"); continue; }
      if (f.size > MAX_BYTES) { setError("Each image must be 5 MB or smaller"); continue; }
      next.push(f);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function submit() {
    const trimmed = body.trim();
    if (!trimmed && files.length === 0) return setError("Type a message or attach an image.");
    setError(null);
    start(async () => {
      try {
        const form = new FormData();
        form.set("body", trimmed);
        for (const f of files) {
          const thumb = await makeThumbnail(f);
          form.append("attachment", f);
          form.append("attachment_thumb", thumb, thumb.name);
        }
        await action(form);
        setBody("");
        setFiles([]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send your reply. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {channel && peerTyping && <p className="text-muted-foreground text-xs">Typing…</p>}
      <Textarea
        rows={3}
        placeholder={placeholder}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (channel) notifyTyping();
        }}
      />

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="bg-muted flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              {f.name}
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || files.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon className="size-4" /> Attach
        </Button>
        <Button onClick={submit} disabled={pending} className="w-fit active:scale-[0.98]">
          {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
          {pending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </div>
  );
}
