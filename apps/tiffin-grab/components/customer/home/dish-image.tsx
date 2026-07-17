import type { FileDetail } from "@realm/storage/model";
import { cn } from "@realm/ui/cn";
import Image from "next/image";
import { hueFromKey } from "./plan-hero";

// Dish photo when present; otherwise a deterministic gradient tile (same hue trick
// as PlanHero) with the dish name, so imageless dishes still look intentional.
//
// `fill` requires the PARENT to be positioned — every call site wraps this in a
// `relative` box. Pass `sizes` matching that box: without it fill assumes 100vw and the
// browser downloads the largest srcset candidate into a small tile.
export function DishImage({
  image,
  name,
  className,
  sizes = "(max-width: 640px) 50vw, 200px",
}: {
  image: FileDetail | null;
  name: string;
  className?: string;
  sizes?: string;
}) {
  if (image?.url) {
    // Static dish photos only — image.url is the unsigned /api/files/<key> form. Secured
    // files carry an ?ak= token and are fenced out by next.config's localPatterns.
    return <Image src={image.url} alt={name} fill sizes={sizes} className={cn("object-cover", className)} />;
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
