import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

/**
 * Shared rounded-square backdrop every illustration in this set sits on — same corner
 * radius, same padding ratio, only the tint and the inner pictogram change. This is what
 * makes a dish-category icon and a delivery-status icon read as one cohesive family instead
 * of mismatched one-offs.
 */
export function IllustrationBadge({
  children,
  tone = "cream",
  size = 40,
  className,
}: {
  children: ReactNode;
  tone?: "cream" | "green" | "orange";
  size?: number;
  className?: string;
}) {
  const bg = tone === "green" ? "#DCEBE1" : tone === "orange" ? "#FBE3D2" : "#F1EEE5";
  return (
    <div
      className={cn("inline-flex shrink-0 items-center justify-center rounded-xl", className)}
      style={{ width: size, height: size, background: bg }}
    >
      {children}
    </div>
  );
}
