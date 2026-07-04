"use client";

import { Loader2Icon, SendIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@realm/ui/button";
import { Textarea } from "@realm/ui/textarea";
import { replyTicket } from "../actions";

export function ReplyForm({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return setError("Type a message first.");
    setError(null);
    start(async () => {
      try {
        await replyTicket(ticketId, trimmed);
        setBody("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send your reply. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        placeholder={closed ? "Replying will reopen this ticket…" : "Write a reply…"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
      <Button onClick={submit} disabled={pending} className="w-fit active:scale-[0.98]">
        {pending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </div>
  );
}
