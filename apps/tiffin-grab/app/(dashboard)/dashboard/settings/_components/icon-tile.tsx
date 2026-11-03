import type { LucideIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { TONES, type Tone } from "@/lib/plugins";

/** System Settings–style squircle: one solid color per setting, a white glyph. */
export function IconTile({ icon: Icon, tone, size = "sm" }: { icon: LucideIcon; tone: Tone; size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        size === "lg" ? "size-12 rounded-xl" : "size-8 rounded-lg",
        TONES[tone],
      )}
    >
      <Icon className={size === "lg" ? "size-6" : "size-4"} />
    </span>
  );
}
