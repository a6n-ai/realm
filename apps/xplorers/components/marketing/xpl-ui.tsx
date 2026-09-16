import Image from "next/image";
import Link from "next/link";
import { cn } from "@foundry/ui/cn";

type Variant = "primary" | "inverse" | "text" | "outline";

export function XplButton({
  href,
  children,
  variant = "primary",
  className,
  type = "button",
  disabled = false,
}: {
  href?: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const styles =
    variant === "inverse"
      ? "xpl-btn xpl-btn-inverse"
      : variant === "text"
        ? "xpl-txt"
        : variant === "outline"
          ? "xpl-btn xpl-btn-outline"
          : "xpl-btn";

  if (href && !disabled) {
    const classNames = cn(styles, className);
    if (href.startsWith("mailto:") || href.startsWith("http")) {
      return (
        <a href={href} className={classNames}>
          {children} <span className="arr" aria-hidden="true">→</span>
        </a>
      );
    }
    return (
      <Link href={href} className={classNames}>
        {children} <span className="arr" aria-hidden="true">→</span>
      </Link>
    );
  }

  return (
    <button type={type} className={cn(styles, className)} disabled={disabled}>
      {children} <span className="arr" aria-hidden="true">→</span>
    </button>
  );
}

export function PhotoFrame({
  label,
  ariaLabel,
  className,
  grid = "ink",
  src,
  sizes = "(min-width: 1024px) 33vw, 100vw",
  objectPosition,
}: {
  label: string;
  ariaLabel: string;
  className?: string;
  grid?: "ink" | "spark" | "dark" | "blush" | "none";
  src?: string;
  sizes?: string;
  objectPosition?: string;
}) {
  let gridClass = "xpl-grid";
  switch (grid) {
    case "spark":
      gridClass = "xpl-grid-spark";
      break;
    case "dark":
      gridClass = "xpl-grid-dark";
      break;
    case "blush":
      gridClass = "xpl-grid-blush";
      break;
    case "none":
      gridClass = "";
      break;
    case "ink":
      gridClass = "xpl-grid";
      break;
    default: {
      const _exhaustive: never = grid;
      return _exhaustive;
    }
  }

  if (src) {
    return (
      <div className={cn("xpl-photo", className)}>
        <Image
          src={src}
          alt={ariaLabel}
          fill
          sizes={sizes}
          className="object-cover"
          style={objectPosition ? { objectPosition } : undefined}
        />
      </div>
    );
  }

  return (
    <div role="img" aria-label={ariaLabel} className={cn("xpl-ph", gridClass, className)}>
      {label}
    </div>
  );
}

export function Cutout({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={cn("xpl-obj overflow-hidden p-0", className)}>
      <Image src={src} alt={alt} fill sizes="210px" className="object-cover" />
    </div>
  );
}

export function TapeLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("xpl-tape", className)}>{children}</span>;
}
