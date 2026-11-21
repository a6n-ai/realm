import Link from "next/link";
import { eq } from "@foundry/commons/model/condition";
import { Button } from "@foundry/ui/button";
import { displayName } from "@/lib/inquiries/display";
import { isClosed } from "@/lib/inquiries/status";
import type { PipelineRow } from "@/lib/inquiries/inquiries.service";
import { NextItemEmpty } from "@/components/dashboard/next-item/next-item-parts";
import { RecommendationGrid, type RecommendationOwner, type RecommendationItem } from "@/components/dashboard/next-item/recommendation-grid";
import { ME, resolveOwnerParam } from "@/lib/list/presets";
import { StatusMenu } from "./_leads/status-dialog";
import { FollowUpBadge } from "./follow-up-badge";
import { NextLeadActions } from "./next-lead-actions";

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
      reason: (
        <>
          <FollowUpBadge lead={lead} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />
          {lead.phone ? null : <span> · No phone</span>}
        </>
      ),
      status: <StatusMenu inquiryId={lead.publicId} subStatus={lead.subStatus} />,
      actions: (
        <NextLeadActions
          inquiryId={lead.publicId}
          name={name}
          phone={lead.phone}
          whatsappPhone={lead.whatsappPhone}
          timeZone={timeZone}
          closed={isClosed(lead.subStatus)}
        />
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
          <Button variant="outline" size="sm" render={<Link href={upcomingHref} prefetch={false} />}>Upcoming</Button>
          <Button variant="ghost" size="sm" render={<Link href={viewAllHref} prefetch={false} />}>All open</Button>
        </NextItemEmpty>
      }
    />
  );
}
