import type { ReactNode } from "react";
import Link from "next/link";
import { ClipboardListIcon, UploadIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { SectionDateRange } from "@/components/filters/section-date-range";

// Everything on the Inquiries page that needs no data. The page fills the slots with Suspense
// around real data; loading.tsx fills them with skeletons, so both paint the same frame.
export function InquiriesChrome({ addActions, stats, next, queue, children }: { addActions: ReactNode; stats: ReactNode; next: ReactNode; queue: ReactNode; children?: ReactNode }) {
  return (
    <PageShell>
      {children}
      <PageHeader
        icon={ClipboardListIcon}
        title="Inquiries"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/inquiries/import">
                <UploadIcon className="size-4" />
                Import
              </Link>
            </Button>
            {addActions}
          </div>
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex">
          <SectionDateRange />
        </div>
        {stats}
      </div>
      {next}
      <SectionCard title="Follow-up queue">{queue}</SectionCard>
    </PageShell>
  );
}
