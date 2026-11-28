import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { toast } from "@foundry/ui/toast";
import { CheckIcon, CopyIcon, MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import type { InquiryDetail as Detail } from "../../lib/inquiries/queries";
import type { LostReason } from "../../lib/inquiries/stages";
import { formatPhone, phoneFlag, telHref } from "../../lib/phone";
import { LINK } from "../link-class";
import { LocalTime } from "../local-time";
import { PageHeader } from "../shell/page-header";
import { ActivityComposer } from "./activity-composer";
import { ActivityTimeline } from "./activity-timeline";
import { EditContactDialog } from "./edit-contact-dialog";
import { FollowUpControl } from "./follow-up-control";
import { LOST_LABEL } from "./labels";
import { OwnerControl } from "./owner-control";
import { PropertiesCard, PropertyRow } from "./property-row";
import { StagePills } from "./stage-pills";

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      toast.success("Email copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy the email");
    }
  }
  const Icon = copied ? CheckIcon : CopyIcon;
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Copy email" onClick={copy}>
      <Icon aria-hidden className="size-3.5" />
    </Button>
  );
}

export function InquiryDetail({ inquiry: i, owners, canAssign, canEdit }: { inquiry: Detail; owners: { id: string; name: string }[]; canAssign: boolean; canEdit: boolean }) {
  const open = i.closedAt === null;
  const title = i.contactName ?? i.phone ?? i.company ?? "Inquiry";
  const [editing, setEditing] = useState(false);
  const [propsOpen, setPropsOpen] = useState(true);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inquiries", to: "/inquiries" }, { label: title }]}
        description={i.company ?? undefined}
        actions={
          <>
            {canEdit ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" />}>
                    <MoreHorizontalIcon aria-hidden className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(true)}>Edit contact</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <EditContactDialog contact={i} open={editing} onOpenChange={setEditing} />
              </>
            ) : null}
          </>
        }
      />
      <div className="px-4 pb-6">
        <StagePills id={i.id} stage={i.stage} canEdit={canEdit} />
      </div>
      <div className="grid items-start gap-6 px-4 pb-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <aside className="order-first lg:sticky lg:top-4 lg:order-last">
          <PropertiesCard open={propsOpen} onToggle={() => setPropsOpen((v) => !v)}>
            <PropertyRow label="Owner">
              <OwnerControl id={i.id} ownerId={i.ownerId} ownerName={i.ownerName} ownerRemoved={i.ownerRemoved} open={open} canAssign={canAssign} owners={owners} />
            </PropertyRow>
            <PropertyRow label="Next follow-up">
              <FollowUpControl key={i.nextFollowUpAt ?? "none"} id={i.id} at={i.nextFollowUpAt} overdue={i.overdue} editable={open && canEdit} />
            </PropertyRow>
            <PropertyRow label="Source">
              {i.source}
              {i.subSource ? ` / ${i.subSource}` : ""}
            </PropertyRow>
            <PropertyRow label="Company">{i.company}</PropertyRow>
            <PropertyRow label="Phone">{i.phone ? <a className={LINK} href={telHref(i.phone)}><span aria-hidden className="mr-1.5">{phoneFlag(i.phone)}</span>{formatPhone(i.phone)}</a> : null}</PropertyRow>
            <PropertyRow label="Email">
              {i.email ? (
                <span className="-my-1.5 flex min-w-0 items-center gap-1">
                  <a className={`truncate ${LINK}`} href={`mailto:${i.email}`}>
                    {i.email}
                  </a>
                  <CopyEmail email={i.email} />
                </span>
              ) : null}
            </PropertyRow>
            {i.lostReason ? <PropertyRow label="Lost reason">{LOST_LABEL[i.lostReason as LostReason] ?? i.lostReason}</PropertyRow> : null}
            <PropertyRow label="Created">
              <span className="grid">
                <span className="whitespace-nowrap">
                  <LocalTime at={i.createdAt} />
                </span>
                {i.createdByName ? <span className="text-xs text-muted-foreground">by {i.createdByName}</span> : null}
              </span>
            </PropertyRow>
          </PropertiesCard>
        </aside>
        <div className="grid min-w-0 gap-8">
          <section className="grid gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Requirements</h2>
              {canEdit && i.requirements ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
            </div>
            {i.requirements ? (
              <p className="max-w-prose whitespace-pre-wrap">{i.requirements}</p>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed p-4">
                <p className="text-muted-foreground">No requirements yet</p>
                {canEdit ? (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    Add
                  </Button>
                ) : null}
              </div>
            )}
          </section>
          <section className="grid gap-3">
            <h2 className="text-sm font-semibold">Activity</h2>
            <ActivityComposer id={i.id} />
            <ActivityTimeline activities={i.activities} />
          </section>
        </div>
      </div>
    </>
  );
}
