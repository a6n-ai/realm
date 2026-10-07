"use client";

import { useEffect, useRef } from "react";
import { cn } from "@foundry/ui/cn";
import { ChatMessageList, type ChatUi } from "@foundry/design-system";
import { withDayChips } from "@/lib/support/chat-days";

export type PaneMessage = {
  publicId: string;
  authorType: string;
  /** Staff member who wrote it (several staff share one queue); null for customer/system. */
  staffName: string | null;
  body: string;
  createdAt: number;
  attachments: { thumbUrl: string; name: string; href: string }[] | null;
};

/**
 * Same chat-app shape as the customer's view: its own scroll window that opens at the
 * newest message, date chips where the day changes, and the time inside each bubble.
 * Staff on the right, the customer on the left.
 */
export function ChatPane({ messages, timezone }: { messages: PaneMessage[]; timezone: string }) {
  const paneRef = useRef<HTMLDivElement>(null);
  const last = messages.at(-1)?.publicId;
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    const pane = paneRef.current;
    if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior: seen.current ? "smooth" : "instant" });
    seen.current = last;
  }, [last]);

  const names = new Map(messages.map((m) => [m.publicId, m.staffName]));
  const ui: Partial<ChatUi> = {
    System: ({ message: m }) =>
      m.meta ? (
        <p className="text-muted-foreground text-center text-[11px]">
          {m.body} · {m.meta}
        </p>
      ) : (
        <p className="flex justify-center py-1">
          <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-[11px] font-semibold">{m.body}</span>
        </p>
      ),
    Bubble: ({ message: m, mine }) => {
      const name = mine ? names.get(m.id) : null;
      return (
        <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
          <div
            className={cn(
              "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm leading-snug",
              mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm",
            )}
          >
            {name ? <p className="mb-0.5 text-[11px] font-semibold opacity-80">{name}</p> : null}
            <p className="whitespace-pre-wrap text-pretty">
              {m.body}
              <span className={cn("float-right mt-1.5 ml-2 text-[10px] leading-none", mine ? "text-primary-foreground/75" : "text-muted-foreground")}>
                {m.meta}
              </span>
            </p>
            {m.attachments?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((a, i) => (
                  <a key={i} href={a.href} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.thumbUrl} alt={a.name} className="size-20 rounded-md border object-cover" />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    },
  };

  return (
    <div ref={paneRef} className="flex h-[60vh] min-h-72 flex-col overflow-y-auto overscroll-contain rounded-lg border p-3">
      <div className="mt-auto">
        <ChatMessageList
          className="space-y-2"
          ui={ui}
          empty={<p className="text-muted-foreground text-center text-sm">No messages yet.</p>}
          messages={withDayChips(messages, timezone, (m, time) => ({
            id: m.publicId,
            kind: m.authorType === "system" ? "system" : m.authorType === "staff" ? "mine" : "theirs",
            body: m.body,
            meta: time,
            attachments: m.attachments,
          }))}
        />
      </div>
    </div>
  );
}
