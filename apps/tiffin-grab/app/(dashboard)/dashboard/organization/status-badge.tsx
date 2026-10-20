import { Badge, type BadgeProps } from "@/components/reui/badge";

type Variant = BadgeProps["variant"];

// One status-to-color map for the whole Organization section, so "pending" or
// "suspended" reads the same on the members list, member detail and invites.
const VARIANTS: Record<string, Variant> = {
  active: "success-light",
  accepted: "success-light",
  pending: "info-light",
  expired: "warning-light",
  inactive: "secondary",
  canceled: "secondary",
  rejected: "secondary",
  suspended: "destructive-light",
  deleted: "destructive-light",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={VARIANTS[status] ?? "secondary"} className="capitalize">
      {status}
    </Badge>
  );
}
