import Image from "next/image";
import { cn } from "@/components/customer/kit/cn";

// Tiffin icon traced from the brand PNGs in docs/Tiffin Grab Logos.
export function BrandMark({ className }: { className?: string }) {
  return <Image src="/brand/mark.svg" alt="" width={40} height={40} priority className={cn("size-9 shrink-0", className)} />;
}

// Live text in the surrounding font, coloured like the logo. "Grab" is forest in
// light mode; on the dark forest background it falls back to the foreground.
export function BrandWordmark({ className, grabClassName = "text-[var(--accent-badge)] dark:text-foreground" }: { className?: string; grabClassName?: string }) {
  return (
    <span className={cn("font-bold leading-none tracking-[-0.02em] whitespace-nowrap", className)}>
      <span className="text-[var(--brand)]">Tiffin</span>
      <span className={grabClassName}>Grab</span>
    </span>
  );
}
