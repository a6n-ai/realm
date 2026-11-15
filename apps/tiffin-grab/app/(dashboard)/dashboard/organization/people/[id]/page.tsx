import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { requirePagePermission } from "@/lib/auth/guards";
import { RESOURCE_LABELS } from "@/lib/auth/permissions";
import { loadMemberPanel } from "../../members/member-panel-data";
import { MemberDetail } from "../../members/member-panel";

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="grid gap-6">
      <Link href="/dashboard/organization/people" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Back to People
      </Link>
      <Suspense fallback={<PersonSkeleton />}>
        <PersonData params={params} />
      </Suspense>
    </div>
  );
}

async function PersonData({ params }: { params: Promise<{ id: string }> }) {
  await requirePagePermission({ member: ["update"] });
  const { id } = await params;
  const data = await loadMemberPanel(id);
  if (!data) notFound();
  return <MemberDetail data={data} resources={RESOURCE_LABELS} />;
}

function PersonSkeleton() {
  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-10 rounded-full" />
        <div className="grid gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
