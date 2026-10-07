"use client";

import { Loader2Icon, PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import type { useMessageComposer } from "@foundry/design-system";
import { COMPOSER_LIMITS } from "@foundry/design-system";

type Composer = ReturnType<typeof useMessageComposer>;

/**
 * Chat-app reply bar for support tickets — attach, one-line field, round send.
 * Shared by customer thread and staff ticket detail.
 */
export function ChatComposer({
  composer,
  placeholder = "Write a message…",
  typingLabel,
}: {
  composer: Composer;
  placeholder?: string;
  typingLabel: string;
}) {
  const { body, onBodyChange, files, removeFile, inputRef, addFiles, pending, error, peerTyping, submit } = composer;
  const empty = !body.trim() && files.length === 0;
  return (
    <div className="space-y-2">
      {peerTyping ? <p className="text-muted-foreground px-3 text-xs">{typingLabel}</p> : null}
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-1" aria-label="Attached images">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="bg-muted flex max-w-[220px] items-center gap-1.5 rounded-full py-1 pr-1 pl-3 text-xs"
            >
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => removeFile(i)}
                className="hover:bg-background grid size-6 shrink-0 place-items-center rounded-full"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive px-3 text-sm">
          {error}
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending && !empty) submit();
        }}
        className="bg-card focus-within:ring-ring/40 flex items-center gap-1.5 rounded-full border p-1.5 focus-within:ring-2"
      >
        <input
          ref={inputRef}
          type="file"
          accept={COMPOSER_LIMITS.accept.join(",")}
          multiple
          hidden
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          aria-label="Attach images"
          disabled={pending || files.length >= COMPOSER_LIMITS.maxFiles}
          onClick={() => inputRef.current?.click()}
          className="text-muted-foreground hover:bg-muted grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-40 [touch-action:manipulation]"
        >
          <PaperclipIcon className="size-5" />
        </button>
        <input
          type="text"
          aria-label="Message"
          autoComplete="off"
          enterKeyHint="send"
          placeholder={placeholder}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          className="placeholder:text-muted-foreground h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={pending || empty}
          className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-40 [touch-action:manipulation]"
        >
          {pending ? <Loader2Icon className="size-5 animate-spin" /> : <SendIcon className="size-5" />}
        </button>
      </form>
    </div>
  );
}
