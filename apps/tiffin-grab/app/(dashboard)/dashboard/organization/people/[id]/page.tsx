import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/guards";
import { RESOURCE_LABELS } from "@/lib/auth/permissions";
import { BreadcrumbLabel } from "@/components/dashboard/app-breadcrumbs";
import { loadMemberPanel } from "../../members/member-panel-data";
import { MemberDetail } from "../../members/member-panel";
import { PersonSkeleton } from "./person-skeleton";

export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="grid gap-6">
      <Link href="/dashboard/organization/people" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden">
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
  return (
    <>
      <BreadcrumbLabel segment={id} label={data.member.name || data.member.email || "Person"} />
      <MemberDetail data={data} resources={RESOURCE_LABELS} />
    </>
  );
}
