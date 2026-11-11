import Link from "next/link";
import { formatMoney } from "@foundry/commons";
import { eq } from "@foundry/commons/model/condition";
import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Button } from "@foundry/ui/button";
import { displayName, planLabelFor } from "@/lib/inquiries/display";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { ContactChips } from "@/components/dashboard/next-item/contact-chips";
import { initials } from "@foundry/ui/initials";
import { NextItemCard, NextItemEmpty, type NextItemView, type OwnerChoice } from "@/components/dashboard/next-item/next-item-card";
import { NextItemOpenButton } from "@/components/dashboard/next-item/open-button";
import { UpNextStrip, type UpNextTile } from "@/components/dashboard/next-item/up-next-strip";
import { StatusMenu } from "./_leads/status-dialog";
import { ago, FollowUpBadge } from "./follow-up-badge";
import { NextLeadIconAction, NextLeadLogOutcome } from "./next-lead-actions";

/** The card's owner scope: the signed-in user by default, everyone for "all", or one staff member's publicId. */
export function leadScope(leadOwner: string | undefined, viewer: string | undefined) {
  const owner = resolveOwnerParam(leadOwner ?? ME, viewer);
  return owner ? eq("owner", owner) : undefined;
}

/** A recommended lead after the current one; `href` opens it in the card (`lead=`) and keeps the list's params. */
export type UpNextRow = PipelineRow & { href: string };
export type NextLeadCardProps = {
  lead: PipelineRow | null;
  timeZone: string;
  currency: string;
  now: number;
  dayStart: number;
  dayEnd: number;
  dueCount: number;
  /** Whether the card's lead is itself in the due queue; decides how many are "more" beyond the strip. */
  leadInQueue: boolean;
  /** 1-based rank of the lead in the due queue; null when it is not in the queue. */
  position: number | null;
  upcomingCount: number;
  owner: { current: string; options: OwnerChoice[] };
  prevHref?: string;
  nextHref?: string;
  upNext: UpNextRow[];
  upcomingHref: string;
  allOpenHref: string;
  plans: { key: string; name: string }[];
};

export function NextLeadCard({ lead, timeZone, currency, now, dayStart, dayEnd, dueCount, leadInQueue, position, upcomingCount, owner, prevHref, nextHref, upNext, upcomingHref, allOpenHref, plans }: NextLeadCardProps) {
  const leadHref = lead ? `/dashboard/inquiries/${lead.publicId}` : "";
  const facts: [string, string | null][] = lead
    ? [
        ["Plan", planLabelFor(plans, lead.planInterest)],
        ["Meal size", lead.mealSizeInterest],
        ["Quoted", lead.quotedPrice == null ? null : formatMoney(Number(lead.quotedPrice), currency)],
        ["Source", lead.source],
        ["Attempts", String(lead.attempts)],
      ]
    : [];
  const item: NextItemView | null = lead
    ? {
        identity: (
          <div className="flex flex-wrap items-center gap-2">
            <Avatar>
              <AvatarFallback>{initials(displayName(lead))}</AvatarFallback>
            </Avatar>
            <Link href={leadHref} className="min-w-0 truncate font-medium hover:underline">
              {displayName(lead)}
            </Link>
            <StatusMenu inquiryId={lead.publicId} subStatus={lead.subStatus} />
            <FollowUpBadge lead={lead} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />
            <div className="ml-auto flex items-center gap-1">
              <NextLeadIconAction inquiryId={lead.publicId} timeZone={timeZone} kind="follow_up" />
              <NextLeadIconAction inquiryId={lead.publicId} timeZone={timeZone} kind="note" />
              <NextItemOpenButton href={leadHref} label="Open lead" />
            </div>
          </div>
        ),
        meta: (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">created {ago(lead.createdAt, now)}</p>
            <ContactChips name={displayName(lead)} phone={lead.phone} whatsappPhone={lead.whatsappPhone} email={lead.email} />
          </div>
        ),
        facts,
        note: lead.lastNote ? (
          <blockquote className="text-muted-foreground border-l-2 pl-3 text-sm">
            <p className="line-clamp-2">{lead.lastNote}</p>
            <footer className="text-xs">{[lead.lastNoteBy, lead.lastNoteAt == null ? null : ago(lead.lastNoteAt, now)].filter(Boolean).join(", ")}</footer>
          </blockquote>
        ) : (
          <p className="text-muted-foreground text-xs">No notes yet</p>
        ),
        primary: <NextLeadLogOutcome inquiryId={lead.publicId} timeZone={timeZone} />,
        upNext:
          upNext.length > 0 ? (
            <UpNextStrip
              label="leads"
              tiles={upNext.map(
                (r): UpNextTile => ({
                  key: r.publicId,
                  href: r.href,
                  title: displayName(r),
                  badge: <FollowUpBadge lead={r} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />,
                  hint: [owner.current === ALL_OWNERS ? (r.ownerName ?? "Unassigned") : null, r.lastNote ?? r.planInterest ?? ago(r.createdAt, now)].filter(Boolean).join(" · "),
                }),
              )}
              more={Math.max(0, dueCount - (leadInQueue ? 1 : 0) - upNext.length)}
              viewAllHref={allOpenHref}
            />
          ) : undefined,
      }
    : null;
  return (
    <NextItemCard
      title="Next lead"
      noun="lead"
      owner={{ current: owner.current, options: owner.options }}
      dueText={position ? `${position} of ${dueCount} due` : `${dueCount} due`}
      prevHref={prevHref}
      nextHref={nextHref}
      item={item}
      empty={
        <NextItemEmpty title="No leads due. You're clear." detail={`${upcomingCount} upcoming`}>
          <Button variant="outline" size="sm" asChild>
            <Link href={upcomingHref} prefetch={false}>Upcoming</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={allOpenHref} prefetch={false}>All open</Link>
          </Button>
        </NextItemEmpty>
      }
    />
  );
}
