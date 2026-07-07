"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";
import { Textarea } from "@realm/ui/textarea";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";
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

// Single source of truth for the control fields (label + trigger width). Both
// the real controls below and the skeleton twin render from this, so the
// loading state can't drift from the component.
const FIELDS = [
  { key: "status", label: "Status", width: "w-48" },
  { key: "owner", label: "Owner", width: "w-44" },
  { key: "priority", label: "Priority", width: "w-36" },
] as const;
const [F_STATUS, F_OWNER, F_PRIORITY] = FIELDS;

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
        <label className="text-muted-foreground text-xs font-medium">{F_STATUS.label}</label>
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
          <SelectTrigger className={F_STATUS.width}><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">{F_OWNER.label}</label>
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
          <SelectTrigger className={F_OWNER.width}>
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED} disabled>Unassigned</SelectItem>
            {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">{F_PRIORITY.label}</label>
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
          <SelectTrigger className={F_PRIORITY.width}><SelectValue /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {(status === "resolved" || status === "closed") && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="active:scale-[0.98]"
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

// Exact loading twin: same field layout + FIELDS source of truth as the real
// controls, grey blocks instead of live selects.
export function TicketControlsSkeleton() {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1">
          <Skeleton className="h-4 w-12" />
          <Skeleton className={cn("h-9", f.width)} />
        </div>
      ))}
    </div>
  );
};

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

// Exact loading twin: same space-y-2 wrapper, grey textarea + grey button.
ReplyBox.Skeleton = function ReplyBoxSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-9 w-24" />
    </div>
  );
};
