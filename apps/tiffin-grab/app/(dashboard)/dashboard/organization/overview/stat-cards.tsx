import { Building2Icon, MailIcon, UsersIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";

function StatCard({ icon: Icon, label, value }: { icon: typeof Building2Icon; label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent><div className="text-2xl font-bold tabular-nums">{value}</div></CardContent>
    </Card>
  );
}

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
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard icon={Building2Icon} label="Franchises" value={franchiseCount} />
      <StatCard icon={UsersIcon} label="Staff" value={staffCount} />
      <StatCard icon={MailIcon} label="Pending invites" value={pendingInviteCount} />
    </div>
  );
}
