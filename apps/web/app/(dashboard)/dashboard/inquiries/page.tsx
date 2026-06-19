import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { Badge } from "@/components/ui/badge";
import { NewInquiryForm } from "./new-inquiry-form";

const STAGES = ["new", "contacted", "follow_up", "converted", "lost"] as const;
const STAGE_LABEL: Record<(typeof STAGES)[number], string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow-up",
  converted: "Converted",
  lost: "Lost",
};

export default async function InquiriesPage() {
  await requireStaff();
  const rows = await db.select().from(inquiries).orderBy(desc(inquiries.createdAt));
  const byStage = (stage: string) => rows.filter((r) => r.stage === stage);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Inquiries</h1>
      <NewInquiryForm />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {STAGES.map((stage) => (
          <div key={stage} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{STAGE_LABEL[stage]}</h2>
              <Badge variant="secondary">{byStage(stage).length}</Badge>
            </div>
            <div className="space-y-2">
              {byStage(stage).map((inq) => (
                <Link
                  key={inq.id}
                  href={`/dashboard/inquiries/${inq.id}`}
                  className="hover:bg-accent block rounded-md border p-3 text-sm"
                >
                  <div className="font-medium">{inq.fullName}</div>
                  <div className="text-muted-foreground">{inq.phone}</div>
                  <div className="text-muted-foreground text-xs capitalize">{inq.source}</div>
                </Link>
              ))}
              {byStage(stage).length === 0 ? <p className="text-muted-foreground text-xs">None</p> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
