import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardListIcon } from "lucide-react";
import { NotFoundError } from "@tiffin/commons";
import { formatEpoch } from "@/lib/format/datetime";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService, type InquiryStage } from "@/lib/services/inquiries.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageShell, PageHeader, SectionCard, ListRow } from "@/components/ds";
import { NoteForm, StageControl } from "./inquiry-controls";

function describe(a: { type: string; note: string | null; fromStage: string | null; toStage: string | null }) {
  switch (a.type) {
    case "created": return "Inquiry created";
    case "converted": return "Converted to an order";
    case "stage_change": return `Stage: ${a.fromStage} → ${a.toStage}`;
    default: return a.note ?? "";
  }
}

export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let inq;
  try {
    inq = await inquiriesService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const activities = await inquiriesService.listActivities(id);
  const converted = inq.stage === "converted";

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardListIcon}
        title={inq.fullName}
        breadcrumbOverrides={{ [inq.publicId]: inq.fullName }}
      />

      <SectionCard title="Details">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StageControl inquiryId={inq.publicId} stage={inq.stage as InquiryStage} />
            {converted ? (
              <span className="text-muted-foreground text-sm">Converted</span>
            ) : (
              <Button asChild>
                <Link href={`/dashboard/inquiries/${inq.publicId}/order`}>Create order</Link>
              </Button>
            )}
            <Badge variant="secondary" className="ml-auto capitalize">{inq.source}</Badge>
          </div>
          <p className="text-muted-foreground text-sm">{inq.phone}{inq.email ? ` · ${inq.email}` : ""}</p>
          {inq.notes ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Initial notes: </span>{inq.notes}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Activity">
        <div className="space-y-3">
          <NoteForm inquiryId={inq.publicId} />
          <div className="space-y-2">
            {activities.map((a) => (
              <ListRow
                key={a.publicId}
                title={describe(a)}
                meta={formatEpoch(a.createdAt, { mode: "datetime" })}
              />
            ))}
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}
