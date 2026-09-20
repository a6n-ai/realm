import { cn } from "./cn";

export type DeliveryStatus = "delivered" | "upcoming" | "vacation" | "hold" | "combined";

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  delivered: "Delivered",
  upcoming: "Upcoming",
  vacation: "Vacation",
  hold: "On hold",
  combined: "Combined",
};

export const STATUS_COLOR: Record<DeliveryStatus, string> = {
  delivered: "var(--s-delivered,#10b981)",
  upcoming: "var(--s-upcoming,#0ea5e9)",
  vacation: "var(--s-vacation,#d98a00)",
  hold: "var(--s-hold,#f43f5e)",
  combined: "var(--muted-foreground,#6E6558)",
};

/** Shape carries meaning alongside colour: combined is a dashed outline. */
export function StatusDot({ status, className, decorative }: { status: DeliveryStatus; className?: string; decorative?: boolean }) {
  const combined = status === "combined";
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : STATUS_LABEL[status]}
      aria-hidden={decorative || undefined}
      className={cn("inline-block size-2 shrink-0 rounded-full", combined && "border-[1.5px] border-dashed", className)}
      style={combined ? { borderColor: STATUS_COLOR.combined } : { background: STATUS_COLOR[status] }}
    />
  );
}

/** Wraps a date/number: delivered gets a solid emerald ring, combined a dashed one. */
export function StatusRing({ status, children, className }: { status?: DeliveryStatus; children: React.ReactNode; className?: string }) {
  const ring = status === "delivered" || status === "combined";
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full", ring && "border-2", className)}
      style={ring ? { borderColor: STATUS_COLOR[status!], borderStyle: status === "combined" ? "dashed" : "solid" } : undefined}
    >
      {children}
    </span>
  );
}
