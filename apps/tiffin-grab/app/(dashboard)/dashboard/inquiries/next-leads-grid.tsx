import Link from "next/link";
import { eq } from "@foundry/commons/model/condition";
import { Button } from "@foundry/ui/button";
import { displayName } from "@/lib/inquiries/display";
import { isClosed } from "@/lib/inquiries/status";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { ContactChips } from "@/components/dashboard/next-item/contact-chips";
import { NextItemEmpty } from "@/components/dashboard/next-item/next-item-card";
import { RecommendationGrid, type RecommendationOwner, type RecommendationItem } from "@/components/dashboard/next-item/recommendation-grid";
import { ALL_OWNERS, ME, resolveOwnerParam } from "@/lib/list/presets";
import { StatusMenu } from "./_leads/status-dialog";
import { FollowUpBadge } from "./follow-up-badge";
import { NextLeadIconAction } from "./next-lead-actions";

/** The grid's owner scope: the signed-in user by default, everyone for "all", or one staff member's publicId. */
export function leadScope(leadOwner: string | undefined, viewer: string | undefined) {
  const owner = resolveOwnerParam(leadOwner ?? ME, viewer);
  return owner ? eq("owner", owner) : undefined;
}

export type NextLeadsGridProps = {
  leads: PipelineRow[];
  /** Due and overdue leads in the owner's scope: the header's "N to act on". */
  toAct: number;
  owner: RecommendationOwner;
  viewAllHref: string;
  upcomingHref: string;
  timeZone: string;
  now: number;
  dayStart: number;
  dayEnd: number;
  error?: string;
};

export function NextLeadsGrid({ leads, toAct, owner, viewAllHref, upcomingHref, timeZone, now, dayStart, dayEnd, error }: NextLeadsGridProps) {
  const items: RecommendationItem[] = leads.map((lead) => {
    const name = displayName(lead);
    return {
      key: lead.publicId,
      name,
      href: `/dashboard/inquiries/${lead.publicId}`,
      reason: <FollowUpBadge lead={lead} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />,
      status: <StatusMenu inquiryId={lead.publicId} subStatus={lead.subStatus} />,
      contact: <ContactChips compact name={name} phone={lead.phone} whatsappPhone={lead.whatsappPhone} email={lead.email} />,
      actions: (
        <>
          <NextLeadIconAction inquiryId={lead.publicId} timeZone={timeZone} kind="call" />
          <NextLeadIconAction inquiryId={lead.publicId} timeZone={timeZone} kind="note" />
          {isClosed(lead.subStatus) ? null : <NextLeadIconAction inquiryId={lead.publicId} timeZone={timeZone} kind="follow_up" />}
        </>
      ),
    };
  });
  return (
    <RecommendationGrid
      title="Next leads"
      owner={owner}
      toAct={toAct}
      viewAllHref={viewAllHref}
      items={items}
      error={error}
      empty={
        <NextItemEmpty title="No leads due. You're clear.">
          <Button variant="outline" size="sm" asChild>
            <Link href={upcomingHref} prefetch={false}>Upcoming</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={viewAllHref} prefetch={false}>All open</Link>
          </Button>
        </NextItemEmpty>
      }
    />
  );
}
