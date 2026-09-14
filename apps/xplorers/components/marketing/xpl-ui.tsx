import Link from "next/link";
import { cn } from "@foundry/ui/cn";

type Variant = "primary" | "inverse" | "text" | "outline";

export function XplButton({
  href,
  children,
  variant = "primary",
  className,
  type = "button",
}: {
  href?: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  type?: "button" | "submit";
}) {
  const styles =
    variant === "inverse"
      ? "xpl-btn xpl-btn-inverse"
      : variant === "text"
        ? "xpl-txt"
        : variant === "outline"
          ? "xpl-btn xpl-btn-outline"
          : "xpl-btn";

  if (href) {
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
    <button type={type} className={cn(styles, className)}>
      {children} <span className="arr" aria-hidden="true">→</span>
    </button>
  );
}

export function PhotoFrame({
  label,
  ariaLabel,
  className,
  grid = "ink",
}: {
  label: string;
  ariaLabel: string;
  className?: string;
  grid?: "ink" | "spark" | "dark" | "none";
}) {
  const gridClass =
    grid === "spark" ? "xpl-grid-spark" : grid === "dark" ? "xpl-grid-dark" : grid === "none" ? "" : "xpl-grid";
  return (
    <div role="img" aria-label={ariaLabel} className={cn("xpl-ph", gridClass, className)}>
      {label}
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
