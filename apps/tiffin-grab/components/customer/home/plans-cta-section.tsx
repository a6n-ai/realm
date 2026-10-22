import Link from "next/link";
import { buttonClass } from "@/components/customer/kit/button-class";
import { Skeleton } from "@/components/customer/kit/skeleton";

/** The public /menu/weekly action row under the board: build a tiffin, a trial if one is open, the PDF. */
export function PlansCtaSection({ trial }: { trial?: { href: string; maxDays: number } | null }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link prefetch={false} href="/subscribe" className={buttonClass({ variant: "hero", size: "lg" })}>Build my tiffin</Link>
      {trial && (
        <Link href={trial.href} className={buttonClass({ size: "lg" })}>
          Try a meal for up to {trial.maxDays} {trial.maxDays === 1 ? "day" : "days"}
        </Link>
      )}
      <a href="/menu/weekly/pdf" className={buttonClass({ size: "lg" })}>Download PDF</a>
    </div>
  );
}

export function PlansCtaSectionSkeleton() {
  return (
    <div className="flex flex-wrap gap-3">
      <Skeleton className="h-[52px] w-40 rounded-full" />
      <Skeleton className="h-[50px] w-36" />
    </div>
  );
}
