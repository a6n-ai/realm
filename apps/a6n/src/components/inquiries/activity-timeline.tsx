import { ArrowRightLeftIcon, FileTextIcon, MailIcon, MessageCircleIcon, PencilIcon, PhoneIcon, PlusIcon, RotateCcwIcon, StickyNoteIcon, UserPlusIcon, UserRoundCheckIcon, type LucideIcon } from "lucide-react";
import type { Activity } from "../../lib/inquiries/queries";
import { RelativeTime } from "../relative-time";
import { HUMAN_VERB, isSystemActivity, systemLine } from "./labels";

export const ACTIVITY_ICON: Record<string, LucideIcon> = {
  note: StickyNoteIcon,
  call: PhoneIcon,
  whatsapp: MessageCircleIcon,
  email: MailIcon,
  created: PlusIcon,
  stage_change: ArrowRightLeftIcon,
  reopened: RotateCcwIcon,
  reassigned: UserRoundCheckIcon,
  doc_started: FileTextIcon,
  doc_joined: UserPlusIcon,
  doc_edited: PencilIcon,
};

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return <p className="text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="grid gap-3">
      {activities.map((a) => {
        const Icon = ACTIVITY_ICON[a.type] ?? StickyNoteIcon;
        if (isSystemActivity(a)) {
          return (
            <li key={a.id} className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
              <span className="flex size-6 shrink-0 items-center justify-center">
                <Icon aria-hidden className="size-3.5" />
              </span>
              <span className="min-w-0">{systemLine(a)}</span>
              <span aria-hidden>·</span>
              <RelativeTime at={a.createdAt} />
            </li>
          );
        }
        return (
          <li key={a.id} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border bg-muted">
              <Icon aria-hidden className="size-3.5" />
            </span>
            <div className="grid min-w-0 flex-1 gap-1 rounded-lg border bg-card p-3">
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-(--strong)">{a.actorName ?? "Someone"}</span>
                <span>{HUMAN_VERB[a.type]}</span>
                <span aria-hidden>·</span>
                <RelativeTime at={a.createdAt} />
              </p>
              {a.note ? <p className="whitespace-pre-wrap">{a.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
