import Image from "next/image";
import { cn } from "@/components/customer/kit/cn";

// Tiffin icon traced from the brand PNGs in docs/Tiffin Grab Logos.
export function BrandMark({ className }: { className?: string }) {
  return <Image src="/brand/mark.svg" alt="" width={40} height={40} priority className={cn("size-9 shrink-0", className)} />;
}

// Live text in the surrounding font, coloured like the logo: "Tiffin" orange, "Grab" green.
// Forest (#185936) on light; on dark backgrounds the logo's leaf green (#72A94B) keeps contrast.
export function BrandWordmark({ className, grabClassName = "text-[#185936] dark:text-[#72A94B]" }: { className?: string; grabClassName?: string }) {
  return (
    <span className={cn("font-bold leading-none tracking-[-0.02em] whitespace-nowrap", className)}>
      <span className="text-[var(--brand)]">Tiffin</span>
      <span className={grabClassName}>Grab</span>
    </span>
  );
}
