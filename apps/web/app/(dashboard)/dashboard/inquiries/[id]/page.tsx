import Link from "next/link";
import { notFound } from "next/navigation";
import { NotFoundError } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService, type InquiryStage } from "@/lib/services/inquiries.service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <section className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{inq.fullName}</h1>
          <p className="text-muted-foreground">{inq.phone}{inq.email ? ` · ${inq.email}` : ""}</p>
        </div>
        <Badge variant="secondary" className="capitalize">{inq.source}</Badge>
      </div>

      <div className="flex items-center gap-3">
        <StageControl inquiryId={inq.publicId} stage={inq.stage as InquiryStage} />
        {converted ? (
          <span className="text-muted-foreground text-sm">Converted</span>
        ) : (
          <Button asChild><Link href={`/dashboard/inquiries/${inq.publicId}/order`}>Create order</Link></Button>
        )}
      </div>

      {inq.notes ? <p className="text-sm"><span className="text-muted-foreground">Initial notes: </span>{inq.notes}</p> : null}

      <div className="space-y-3">
        <h2 className="font-medium">Activity</h2>
        <NoteForm inquiryId={inq.publicId} />
        <ul className="space-y-2">
          {activities.map((a) => (
            <li key={a.publicId} className="rounded-md border p-3 text-sm">
              <div>{describe(a)}</div>
              <div className="text-muted-foreground text-xs">{new Date(a.createdAt).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
