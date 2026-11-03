import type { LucideIcon } from "lucide-react";
import type { PluginLogo } from "@foundry/commons/plugin";
import { cn } from "@foundry/ui/cn";
import { Skeleton } from "@foundry/ui/skeleton";
import { TONES, type Tone } from "@/lib/plugins";

const SIZES = { sm: "size-8 rounded-lg", lg: "size-12 rounded-xl" } as const;
const GLYPH = { sm: "size-4", lg: "size-6" } as const;

/**
 * System Settings–style squircle with a white glyph. A third-party plugin shows its own brand
 * mark on its brand color (categorical identity, fixed in both themes); everything else gets a tone.
 */
export function IconTile({
  icon: Icon,
  tone,
  logo,
  size = "sm",
}: {
  icon: LucideIcon;
  tone: Tone;
  logo?: PluginLogo;
  size?: keyof typeof SIZES;
}) {
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center", SIZES[size], logo ? "text-white" : TONES[tone])}
      style={logo ? { backgroundColor: `#${logo.hex}` } : undefined}
    >
      {logo ? (
        <svg viewBox="0 0 24 24" className={GLYPH[size]} fill="currentColor">
          <path d={logo.path} />
        </svg>
      ) : (
        <Icon className={GLYPH[size]} />
      )}
    </span>
  );
}

export function IconTileSkeleton({ size = "sm" }: { size?: keyof typeof SIZES }) {
  return <Skeleton className={cn("shrink-0", SIZES[size])} />;
}
