import { PageHeader, SkeletonFormCard } from "@/components/ds";
import { UsersIcon } from "lucide-react";

export default function Loading() {
  return (
    <>
      <PageHeader icon={UsersIcon} title="Lead assignment" />
      <SkeletonFormCard fields={4} />
    </>
  );
}
