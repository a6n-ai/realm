import type { FileDetail } from "@realm/storage/model";
import { cn } from "@realm/ui/cn";
import { hueFromKey } from "./plan-hero";

// Dish photo when present; otherwise a deterministic gradient tile (same hue trick
// as PlanHero) with the dish name, so imageless dishes still look intentional.
export function DishImage({ image, name, className }: { image: FileDetail | null; name: string; className?: string }) {
  if (image?.url) {
    // Plain <img>: dish photos come from /api/files (already sized/cached); next/image
    // would need remotePatterns config for the file route.
    return <img src={image.url} alt={name} loading="lazy" className={cn("h-full w-full object-cover", className)} />;
  }
  const hue = hueFromKey(name);
  return (
    <div
      className={cn("flex h-full w-full items-center justify-center p-2 text-center text-xs font-medium text-white/90", className)}
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue} 65% 55%), hsl(${(hue + 40) % 360} 65% 45%))` }}
    >
      {name}
    </div>
  );
}
