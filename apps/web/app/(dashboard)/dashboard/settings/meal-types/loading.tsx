import { PageHeader, SkeletonFormCard } from "@/components/ds";
import { UtensilsCrossedIcon } from "lucide-react";

export default function Loading() {
  return (
    <>
      <PageHeader icon={UtensilsCrossedIcon} title="Meal types" />
      <SkeletonFormCard fields={4} />
    </>
  );
}
