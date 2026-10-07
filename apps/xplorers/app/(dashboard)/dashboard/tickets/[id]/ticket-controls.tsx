"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@foundry/ui/select";
import { Skeleton } from "@foundry/ui/skeleton";
import { useMessageComposer } from "@foundry/design-system";
import type { RealtimeRole } from "@foundry/realtime";
import { ChatComposer } from "@/components/support/chat-composer";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { replyTicket, setStatus } from "../actions";

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_customer", label: "Waiting on customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export function TicketControls({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">Status</label>
        <Select
          defaultValue={status}
          disabled={pending}
          onValueChange={(v) =>
            start(async () => {
              const { previous } = await setStatus(ticketId, v as TicketStatus);
              router.refresh();
              if (previous !== v) toast(`Status → ${v}`);
            })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(status === "resolved" || status === "closed") && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setStatus(ticketId, "open");
              router.refresh();
              toast("Ticket reopened");
            })
          }
        >
          Reopen ticket
        </Button>
      )}
    </div>
  );
}

export function TicketControlsSkeleton() {
  return (
    <div className="space-y-1">
      <Skeleton className="h-4 w-12" />
      <Skeleton className="h-9 w-48" />
    </div>
  );
}

export function ReplyBox({
  ticketId,
  closed,
  channel,
  peerRole,
}: {
  ticketId: string;
  closed: boolean;
  channel?: string;
  peerRole?: RealtimeRole;
}) {
  const c = useMessageComposer({ action: replyTicket.bind(null, ticketId), channel, peerRole });
  if (closed) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">
        This ticket is closed. Reopen it to continue the conversation.
      </p>
    );
  }
  return <ChatComposer composer={c} placeholder="Reply to the customer…" typingLabel="Customer is typing…" />;
}

export function ReplyBoxSkeleton() {
  return <Skeleton className="h-[54px] w-full rounded-3xl" />;
}
