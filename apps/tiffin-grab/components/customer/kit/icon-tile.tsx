import type { ReactNode } from "react";
import { cn } from "./cn";

// iOS system colours, as on the Settings rows: a white glyph on a rounded square tells sections apart at a glance.
const TINT = {
  blue: "bg-[#007AFF]",
  green: "bg-[#34C759]",
  teal: "bg-[#30B0C7]",
  indigo: "bg-[#5856D6]",
  orange: "bg-[#FF9500]",
  pink: "bg-[#FF2D55]",
  red: "bg-[#FF3B30]",
  purple: "bg-[#AF52DE]",
  brown: "bg-[#A2845E]",
  cyan: "bg-[#32ADE6]",
  mint: "bg-[#00C7BE]",
  yellow: "bg-[#FFCC00] !text-[#3D2E00]",
  gray: "bg-[#8E8E93]",
} as const;

export type IconTint = keyof typeof TINT;

/** Settings-style icon: white glyph on an iOS-coloured rounded square. `lg` for cards, default for list rows. */
export function IconTile({ tint, size = "md", className, children }: { tint: IconTint; size?: "md" | "lg"; className?: string; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center text-white [&_svg]:shrink-0",
        size === "lg" ? "size-10 rounded-xl [&_svg]:size-5" : "size-8 rounded-lg [&_svg]:size-[18px]",
        TINT[tint],
        className,
      )}
    >
      {children}
    </span>
  );
}
