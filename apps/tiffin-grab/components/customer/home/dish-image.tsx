import type { FileDetail } from "@realm/storage/model";
import { cn } from "@realm/ui/cn";
import Image from "next/image";
import { Utensils } from "lucide-react";
import { DISH_CATEGORY_ILLUSTRATION } from "@/components/illustrations/dish-categories";

// Dish photo when present; otherwise a plain neutral tile with a category icon
// and the dish name — no per-dish colour, so an imageless menu still scans as
// one calm, consistent surface instead of a wall of random gradients.
//
// `fill` requires the PARENT to be positioned — every call site wraps this in a
// `relative` box. Pass `sizes` matching that box: without it fill assumes 100vw and the
// browser downloads the largest srcset candidate into a small tile.
export function DishImage({
  image,
  name,
  category,
  className,
  sizes = "(max-width: 640px) 50vw, 200px",
}: {
  image: FileDetail | null;
  name: string;
  category?: string | null;
  className?: string;
  sizes?: string;
}) {
  if (image?.url) {
    // Static dish photos only — image.url is the unsigned /api/files/<key> form. Secured
    // files carry an ?ak= token and are fenced out by next.config's localPatterns.
    return <Image src={image.url} alt={name} fill sizes={sizes} className={cn("object-cover", className)} />;
  }
  const Illustration = category && DISH_CATEGORY_ILLUSTRATION[category];
  return (
    <div className={cn("bg-secondary flex h-full w-full flex-col items-center justify-center gap-1 p-2", className)}>
      {Illustration ? (
        <Illustration size={28} />
      ) : (
        <Utensils className="text-muted-foreground size-5" strokeWidth={1.5} aria-hidden />
      )}
    </div>
  );
}
