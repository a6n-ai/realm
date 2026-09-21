"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { usePresence, useTyping } from "@foundry/realtime/client";
import { Button, Notice, Pill, Skeleton, Textarea } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";
import { makeImageThumbnail } from "@/components/ds";
import { categoryLabel, subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import { formatEpoch } from "@/lib/format/datetime";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { replyTicket } from "@/app/(customer)/me/support/actions";
import { MAX_FILES, PhotoPicker, STATUS_LABEL, STATUS_TONE, useImageFiles } from "./parts";

type ThreadTicket = {
  publicId: string;
  status: string;
  category: string;
  subcategory?: string | null;
  createdAt: number;
  subject?: string;
};

type ThreadMessage = {
  publicId: string;
  authorType: string;
  body: string;
  createdAt: number;
  attachments?: { thumbUrl: string; name: string; href: string }[] | null;
};

export function TicketThread({ ticket, messages, timezone }: { ticket: ThreadTicket; messages: ThreadMessage[]; timezone: string }) {
  const status = ticket.status as TicketStatus;
  const closed = status === "resolved" || status === "closed";
  const channel = `ticket:${ticket.publicId}`;
  const supportOnline = usePresence(channel, "staff");
  const fmt = (t: number) => formatEpoch(t, { timeZone: timezone, mode: "datetime", locale: "en-CA" });
  const sub = subcategoryLabel(ticket.category, ticket.subcategory ?? null);

  return (
    <div className={cn(FONT, "space-y-5")}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
        <Pill>{categoryLabel(ticket.category)}</Pill>
        {sub ? <Pill>{sub}</Pill> : null}
        <span className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Opened {fmt(ticket.createdAt)}</span>
        <span aria-live="polite" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground,#6E6558)]">
          <span aria-hidden className={cn("size-2 rounded-full", supportOnline ? "bg-[var(--s-delivered-fg)]" : "bg-[var(--border)]")} />
          Support {supportOnline ? "online" : "offline"}
        </span>
      </div>

      <ol className="space-y-3 pb-2">
        {messages.map((m) => {
          if (m.authorType === "system") {
            return (
              <li key={m.publicId} className="text-center text-[13px] text-[var(--muted-foreground,#6E6558)]">
                {m.body} · {fmt(m.createdAt)}
              </li>
            );
          }
          const mine = m.authorType === "customer";
          return (
            <li key={m.publicId} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[88%] rounded-[20px] px-4 py-2.5 text-[15px] leading-snug sm:max-w-[75%]",
                  mine ? "rounded-br-md bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "rounded-bl-md border border-[var(--border)] bg-[var(--card)]",
                )}
              >
                <p className="whitespace-pre-wrap text-pretty">{m.body}</p>
                {m.attachments?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a, i) => (
                      <a key={i} href={a.href} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.thumbUrl} alt={a.name} className="size-24 rounded-xl object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="px-1 text-[12px] text-[var(--muted-foreground,#6E6558)]">
                {mine ? "You" : "Support"} · {fmt(m.createdAt)}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="c-glass sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t border-[var(--border)] px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
        <Composer ticketId={ticket.publicId} closed={closed} channel={channel} />
      </div>
    </div>
  );
}

function Composer({ ticketId, closed, channel }: { ticketId: string; closed: boolean; channel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { files, setFiles, inputRef, add } = useImageFiles(setError);
  const { peerTyping, notifyTyping } = useTyping(channel, "staff");

  if (closed) {
    return <p className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-[15px] text-[var(--muted-foreground,#6E6558)]">This ticket is closed. Staff can reopen it to continue the conversation.</p>;
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
          const thumb = await makeImageThumbnail(f);
          form.append("attachment", f);
          form.append("attachment_thumb", thumb, thumb.name);
        }
        await replyTicket(ticketId, form);
        setBody("");
        setFiles([]);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send your reply. Please try again.");
      }
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {peerTyping ? <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Support is typing…</p> : null}
      <Textarea
        label="Reply"
        rows={3}
        placeholder="Write a reply…"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          notifyTyping();
        }}
      />
      <PhotoPicker files={files} inputRef={inputRef} onAdd={add} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} disabled={pending} label={`Attach (up to ${MAX_FILES})`} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button type="submit" variant="primary" size="lg" pending={pending} className="w-full sm:w-auto">
        <Send aria-hidden className="size-4" />
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </form>
  );
}

export function TicketThreadSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      {[false, true, false].map((mine, i) => (
        <div key={i} className={cn("flex", mine && "justify-end")}>
          <Skeleton className="h-12 w-56" />
        </div>
      ))}
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
