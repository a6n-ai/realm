import { initials } from "@/lib/format/initials";
import { Avatar, AvatarBadge, AvatarFallback } from "@foundry/ui/avatar";
import { cn } from "@foundry/ui/cn";

const PRESENCE_CLASS: Record<"active" | "idle" | "off", string> = {
  active: "bg-ok",
  idle: "bg-warn",
  off: "bg-muted-foreground/40",
};

/**
 * Initials avatar for people lists (users, staff). `presence` renders the small
 * corner dot from account status — omit it where status isn't relevant.
 */
export function UserAvatar({
  name,
  fallbackText,
  presence,
  size = "default",
  className,
}: {
  name: string | null;
  fallbackText?: string | null;
  presence?: "active" | "idle" | "off";
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={cn(className)}>
      <AvatarFallback>{initials(name?.trim() || fallbackText)}</AvatarFallback>
      {presence && <AvatarBadge className={PRESENCE_CLASS[presence]} />}
    </Avatar>
  );
}
