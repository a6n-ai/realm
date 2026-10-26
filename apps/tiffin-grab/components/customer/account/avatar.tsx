import { cn } from "@/components/customer/kit/cn";

export const avatarInitials = (name: string | null) =>
  (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** Same look as the top-bar avatar: the photo, or initials on a clear-glass round. `className` sets size and type. */
export function Avatar({ name, image, className }: { name: string | null; image: string | null; className: string }) {
  return (
    <span aria-hidden className={cn("c-liquid grid shrink-0 place-items-center overflow-hidden rounded-full border border-transparent font-semibold", className)}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- secured file URL carries a per-request token
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        avatarInitials(name)
      )}
    </span>
  );
}
