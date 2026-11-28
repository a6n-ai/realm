import { runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { Input } from "@foundry/ui/input";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { fromDateInput, toDateInput } from "../../lib/dates";
import { errorText } from "../../lib/error-copy";
import { setFollowUpFn } from "../../lib/inquiries/inquiries.fns";
import type { InquiryDetail as Detail } from "../../lib/inquiries/queries";
import type { LostReason } from "../../lib/inquiries/stages";
import { formatPhone, telHref } from "../../lib/phone";
import { LINK } from "../link-class";
import { LocalTime } from "../local-time";
import { PageHeader } from "../shell/page-header";
import { ActivityComposer } from "./activity-composer";
import { ActivityTimeline } from "./activity-timeline";
import { EditContactDialog } from "./edit-contact-dialog";
import { FollowUpBadge } from "./follow-up-badge";
import { LOST_LABEL } from "./labels";
import { OwnerControl } from "./owner-control";
import { PropertiesCard, PropertyRow } from "./property-row";
import { StageMenu } from "./stage-menu";

function FollowUp({ id, at, overdue, editable }: { id: string; at: number | null; overdue: boolean; editable: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(at === null ? "" : toDateInput(at));
  const next = fromDateInput(value);
  const dirty = value !== (at === null ? "" : toDateInput(at));
  return (
    <div className="grid gap-2">
      <FollowUpBadge at={at} overdue={overdue} />
      {editable ? (
        <>
          <Input aria-label="Next follow-up" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
          {next !== null && dirty ? (
            <Button variant="outline" onClick={() => runAction(() => setFollowUpFn({ data: { id, at: next } }), "Follow-up saved", () => router.invalidate(), errorText)}>
              Save date
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

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
            <StageMenu id={i.id} stage={i.stage} canEdit={canEdit} />
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
      <div className="grid items-start gap-6 px-4 pb-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <aside className="order-first lg:sticky lg:top-4 lg:order-last">
          <PropertiesCard open={propsOpen} onToggle={() => setPropsOpen((v) => !v)}>
            <PropertyRow label="Status">
              <StageMenu id={i.id} stage={i.stage} canEdit={canEdit} />
            </PropertyRow>
            <PropertyRow label="Owner">
              <OwnerControl id={i.id} ownerId={i.ownerId} ownerName={i.ownerName} ownerRemoved={i.ownerRemoved} open={open} canAssign={canAssign} owners={owners} />
            </PropertyRow>
            <PropertyRow label="Next follow-up">
              <FollowUp key={i.nextFollowUpAt ?? "none"} id={i.id} at={i.nextFollowUpAt} overdue={i.overdue} editable={open && canEdit} />
            </PropertyRow>
            <PropertyRow label="Source">
              {i.source}
              {i.subSource ? ` / ${i.subSource}` : ""}
            </PropertyRow>
            <PropertyRow label="Company">{i.company}</PropertyRow>
            <PropertyRow label="Phone">{i.phone ? <a className={LINK} href={telHref(i.phone)}>{formatPhone(i.phone)}</a> : null}</PropertyRow>
            <PropertyRow label="Email">
              {i.email ? (
                <span className="flex min-w-0 items-center gap-1">
                  <a className={`truncate ${LINK}`} href={`mailto:${i.email}`}>
                    {i.email}
                  </a>
                  <CopyEmail email={i.email} />
                </span>
              ) : null}
            </PropertyRow>
            {i.lostReason ? <PropertyRow label="Lost reason">{LOST_LABEL[i.lostReason as LostReason] ?? i.lostReason}</PropertyRow> : null}
            <PropertyRow label="Created">
              <LocalTime at={i.createdAt} />
              {i.createdByName ? <span className="text-muted-foreground"> by {i.createdByName}</span> : null}
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
