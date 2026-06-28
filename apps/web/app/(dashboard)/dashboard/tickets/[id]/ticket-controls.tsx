"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { assignOwner, replyTicket, setPriority, setStatus } from "../actions";
import type { TicketPriority, TicketStatus } from "@/lib/services/tickets.service";

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_customer", label: "Waiting on customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const UNASSIGNED = "__unassigned__";

export function TicketControls({
  ticketId,
  status,
  priority,
  ownerId,
  staff,
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
  ownerId: string | null;
  staff: { id: string; name: string }[];
}) {
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
              if (previous !== v) {
                toast(`Status → ${v}`, {
                  action: {
                    label: "Undo",
                    onClick: () =>
                      start(async () => {
                        await setStatus(ticketId, previous);
                        router.refresh();
                      }),
                  },
                });
              }
            })
          }
        >
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">Owner</label>
        <Select
          value={ownerId ?? UNASSIGNED}
          disabled={pending}
          onValueChange={(v) => {
            if (v === UNASSIGNED) return;
            start(async () => {
              await assignOwner(ticketId, v);
              router.refresh();
              toast("Owner updated");
            });
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED} disabled>Unassigned</SelectItem>
            {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">Priority</label>
        <Select
          defaultValue={priority}
          disabled={pending}
          onValueChange={(v) =>
            start(async () => {
              await setPriority(ticketId, v as TicketPriority);
              router.refresh();
              toast(`Priority → ${v}`);
            })
          }
        >
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function ReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    start(async () => {
      await replyTicket(ticketId, trimmed);
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        placeholder="Reply to the customer…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Button disabled={pending || !body.trim()} onClick={submit} className="w-fit">
        Send reply
      </Button>
    </div>
  );
}
