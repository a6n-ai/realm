"use client";

import type { RealtimeRole } from "@foundry/realtime";
import { usePresence } from "@foundry/realtime/client";
import { cn } from "@foundry/ui/cn";

/**
 * Online/offline indicator for the counterpart on a realtime channel.
 * `peerRole` is the OTHER side (staff view watches "customer", etc.).
 */
export function PresenceDot({
  channel,
  peerRole,
  label,
}: {
  channel: string;
  peerRole: RealtimeRole;
  label: string;
}) {
  const online = usePresence(channel, peerRole);
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs" aria-live="polite">
      <span
        className={cn("size-2 rounded-full", online ? "bg-ok" : "bg-muted-foreground/40")}
        aria-hidden
      />
      {label} {online ? "online" : "offline"}
    </span>
  );
}
