"use client";

import { PRIORITY_OPTIONS } from "@/lib/support/ticket-priority";
import {
  CATEGORY_LABEL,
  SUBCATEGORIES,
  TICKET_CATEGORIES,
  type TicketCategoryValue,
} from "@/lib/support/ticket-taxonomy";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@foundry/ui/select";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import type { RealtimeRole } from "@foundry/realtime";
import { useMessageComposer } from "@foundry/design-system";
import { ChatComposer } from "@/components/support/chat-composer";
import { assignOwner, replyTicket, setCategory, setPriority, setStatus } from "../actions";
import type { TicketPriority, TicketStatus } from "@/lib/services/tickets.service";

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_customer", label: "Waiting on customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITIES: { value: TicketPriority; label: string }[] = PRIORITY_OPTIONS;

const UNASSIGNED = "__unassigned__";
const PICK_SUB = "__pick_sub__";

// Single source of truth for the control fields (label + trigger width). Both
// the real controls below and the skeleton twin render from this, so the
// loading state can't drift from the component.
// Status lives only in the conversation's pills; these are the ticket's other settings.
const FIELDS = [
  { key: "category", label: "Category", width: "w-44" },
  { key: "subcategory", label: "Sub-category", width: "w-48" },
  { key: "owner", label: "Owner", width: "w-44" },
  { key: "priority", label: "Priority", width: "w-36" },
] as const;
const [F_CATEGORY, F_SUBCATEGORY, F_OWNER, F_PRIORITY] = FIELDS;

function isSelectableCategory(value: string): value is TicketCategoryValue {
  return (TICKET_CATEGORIES as readonly string[]).includes(value);
}

export function TicketControls({
  ticketId,
  category,
  subcategory,
  priority,
  ownerId,
  staff,
}: {
  ticketId: string;
  category: string;
  subcategory: string | null;
  priority: TicketPriority;
  ownerId: string | null;
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // Category change clears the sub-category locally until staff pick a valid pair;
  // only then do we persist (same rule as customer create). Legacy / unknown
  // values start blank so the selects stay controllable.
  const initialCategory = isSelectableCategory(category) ? category : "";
  const initialSub =
    initialCategory &&
    subcategory &&
    SUBCATEGORIES[initialCategory].some((s) => s.value === subcategory)
      ? subcategory
      : "";
  const [draftCategory, setDraftCategory] = useState(initialCategory);
  const [draftSubcategory, setDraftSubcategory] = useState(initialSub);

  const subOptions = draftCategory ? SUBCATEGORIES[draftCategory] : [];

  function savePair(nextCategory: TicketCategoryValue, nextSubcategory: string) {
    start(async () => {
      try {
        await setCategory(ticketId, nextCategory, nextSubcategory);
        router.refresh();
        toast("Category updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update category");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">{F_CATEGORY.label}</label>
        <Select
          value={draftCategory || undefined}
          disabled={pending}
          onValueChange={(v) => {
            const next = v as TicketCategoryValue;
            setDraftCategory(next);
            setDraftSubcategory("");
          }}
        >
          <SelectTrigger className={F_CATEGORY.width}>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {TICKET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <label className="text-muted-foreground text-xs font-medium">{F_SUBCATEGORY.label}</label>
        <Select
          value={draftSubcategory || PICK_SUB}
          disabled={pending || !draftCategory}
          onValueChange={(v) => {
            if (v === PICK_SUB || !draftCategory) return;
            setDraftSubcategory(v);
            savePair(draftCategory, v);
          }}
        >
          <SelectTrigger className={F_SUBCATEGORY.width}>
            <SelectValue placeholder="Sub-category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PICK_SUB} disabled>
              {draftCategory ? "Pick sub-category" : "Pick category first"}
            </SelectItem>
            {subOptions.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
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
              try {
                await assignOwner(ticketId, v);
                router.refresh();
                toast("Owner updated");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to update owner");
              }
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
    return <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-sm">This ticket is closed. Reopen it to continue the conversation.</p>;
  }
  return <ChatComposer composer={c} placeholder="Reply to the customer…" typingLabel="Customer is typing…" />;
}

// Exact loading twin: the one-line chat bar.
// Named export, not ReplyBox.Skeleton: the server page renders this fallback and
// cannot dot into this "use client" module.
export function ReplyBoxSkeleton() {
  return (
    <Skeleton className="h-[54px] w-full rounded-3xl" />
  );
}

/**
 * Status as one-tap pills right above the chat, so staff move it without leaving the
 * conversation. The customer sees the same status as a plain-words banner.
 */
export function StatusPills({ ticketId, status }: { ticketId: string; status: TicketStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Chat status" className="flex flex-wrap gap-1.5">
      {STATUSES.map((s) => {
        const on = s.value === status;
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={pending || on}
            onClick={() =>
              start(async () => {
                await setStatus(ticketId, s.value);
                router.refresh();
                toast(`Status → ${s.label}`);
              })
            }
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default",
              on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground",
              pending && !on && "opacity-50",
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
