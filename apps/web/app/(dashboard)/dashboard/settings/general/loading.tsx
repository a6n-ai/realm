import { PageHeader, SkeletonFormCard } from "@/components/ds";
import { SettingsIcon } from "lucide-react";

export default function Loading() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="General" />
      <SkeletonFormCard fields={3} />
    </>
  );
}
