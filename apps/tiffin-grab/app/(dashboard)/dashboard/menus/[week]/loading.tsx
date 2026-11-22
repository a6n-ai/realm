import Link from "next/link";
import { ArrowLeft, CalendarIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilderSkeleton } from "../menu-builder";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader
          icon={CalendarIcon}
          title="Weekly Menu"
          actions={
            <Link
              href="/dashboard/menus"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              All menus
            </Link>
          }
        />
        <SectionCard title="Menu">
          <MenuBuilderSkeleton />
        </SectionCard>
      </PageShell>
    </div>
  );
}
