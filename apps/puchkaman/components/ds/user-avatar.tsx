import { Avatar, AvatarBadge, AvatarFallback } from "@foundry/ui/avatar";
import { cn } from "@foundry/ui/cn";

function initials(name: string | null, fallback: string | null): string {
  const source = (name?.trim() || fallback?.trim() || "?").split(/\s+/);
  const first = source[0]?.[0] ?? "";
  const last = source.length > 1 ? (source[source.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

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
      <AvatarFallback>{initials(name, fallbackText ?? null)}</AvatarFallback>
      {presence && <AvatarBadge className={PRESENCE_CLASS[presence]} />}
    </Avatar>
  );
}
