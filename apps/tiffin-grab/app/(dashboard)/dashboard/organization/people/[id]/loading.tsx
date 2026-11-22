import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { PersonSkeleton } from "./person-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <Link href="/dashboard/organization/people" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden">
        <ArrowLeftIcon className="size-4" /> Back to People
      </Link>
      <PersonSkeleton />
    </div>
  );
}
