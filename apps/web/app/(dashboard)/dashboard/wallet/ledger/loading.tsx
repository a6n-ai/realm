import { SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div className="rounded-lg border">
      <SkeletonTable columns={7} />
    </div>
  );
}
