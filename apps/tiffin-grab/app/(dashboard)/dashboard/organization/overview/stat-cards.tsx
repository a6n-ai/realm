import { Building2Icon, MailIcon, UsersIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { StatCard } from "@/components/ds";

export function StatCards({
  franchiseCount,
  staffCount,
  pendingInviteCount,
}: {
  franchiseCount: number;
  staffCount: number;
  pendingInviteCount: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard icon={Building2Icon} label="Franchises" value={franchiseCount} hint="Shops under the brand" />
      <StatCard icon={UsersIcon} label="Staff" value={staffCount} hint="Admins and members" />
      <StatCard icon={MailIcon} label="Pending invites" value={pendingInviteCount} hint="Waiting to be accepted" />
    </div>
  );
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
