import { PageHeader } from "../shell/page-header";
import { runAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { fromDateInput, toDateInput } from "../../lib/dates";
import { errorText } from "../../lib/error-copy";
import { setFollowUpFn } from "../../lib/inquiries/inquiries.fns";
import type { InquiryDetail as Detail } from "../../lib/inquiries/queries";
import { LocalTime } from "../local-time";
import { ActivityComposer } from "./activity-composer";
import { ActivityTimeline } from "./activity-timeline";
import { EditContactDialog } from "./edit-contact-dialog";
import { FollowUpBadge } from "./follow-up-badge";
import { OwnerControl } from "./owner-control";
import { StageBadge } from "./stage-badge";
import { StageControl } from "./stage-control";
import { LINK } from "../link-class";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-md border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children ?? "-"}</dd>
    </div>
  );
}

function FollowUp({ id, at, overdue, open }: { id: string; at: number | null; overdue: boolean; open: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(at === null ? "" : toDateInput(at));
  const next = fromDateInput(value);
  return (
    <div className="grid gap-3">
      <FollowUpBadge at={at} overdue={overdue} />
      {open ? (
        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="follow-up">Next follow-up</Label>
            <Input id="follow-up" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button variant="outline" disabled={next === null} onClick={() => runAction(() => setFollowUpFn({ data: { id, at: next! } }), "Follow-up saved", () => router.invalidate(), errorText)}>
            Save date
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function InquiryDetail({ inquiry: i, owners, canAssign }: { inquiry: Detail; owners: { id: string; name: string }[]; canAssign: boolean }) {
  const open = i.closedAt === null;
  const title = i.contactName ?? i.phone ?? i.company ?? "Inquiry";
  return (
    <>
      <PageHeader crumbs={[{ label: "Inquiries", to: "/inquiries" }, { label: title }]} badge={<StageBadge stage={i.stage} />} actions={<EditContactDialog contact={i} />} />
      <div className="grid gap-4 px-4 pb-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Panel title="Contact">
            <dl className="grid gap-3">
              <Fact label="Name">{i.contactName}</Fact>
              <Fact label="Phone">{i.phone ? <a className={LINK} href={`tel:${i.phone}`}>{i.phone}</a> : null}</Fact>
              <Fact label="Email">{i.email ? <a className={LINK} href={`mailto:${i.email}`}>{i.email}</a> : null}</Fact>
              <Fact label="Company">{i.company}</Fact>
              <Fact label="Source">
                {i.source}
                {i.subSource ? ` / ${i.subSource}` : ""}
              </Fact>
              <Fact label="Requirements">{i.requirements ? <span className="whitespace-pre-wrap">{i.requirements}</span> : null}</Fact>
              <Fact label="Created">
                <LocalTime at={i.createdAt} />
              </Fact>
            </dl>
          </Panel>
          <Panel title="Stage">
            {i.lostReason ? <p className="text-muted-foreground">Lost: {i.lostReason.replaceAll("_", " ")}</p> : null}
            <StageControl id={i.id} stage={i.stage} />
          </Panel>
          <Panel title="Owner">
            <OwnerControl id={i.id} ownerId={i.ownerId} ownerName={i.ownerName} ownerRemoved={i.ownerRemoved} open={open} canAssign={canAssign} owners={owners} />
          </Panel>
          <Panel title="Follow-up">
            <FollowUp key={i.nextFollowUpAt ?? "none"} id={i.id} at={i.nextFollowUpAt} overdue={i.overdue} open={open} />
          </Panel>
        </div>
        <div className="grid content-start gap-4">
          <Panel title="Log activity">
            <ActivityComposer id={i.id} />
          </Panel>
          <Panel title="Activity">
            <ActivityTimeline activities={i.activities} />
          </Panel>
        </div>
      </div>
    </>
  );
}
